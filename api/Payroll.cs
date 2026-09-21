using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Neighborhood.Database;

namespace Neighborhood;

// CRUD de nómina de guardias (dbo.Payroll), calcado del patrón de
// Payments.cs. Period es el mes que cubre el pago (normalizado al día 1
// de ese mes). No hay regla de "no duplicar" como en Payments: un mismo
// guardia puede tener más de un registro de nómina en el mismo mes si
// hace falta corregir algo (el usuario no pidió esa restricción acá).
//
// Amount nunca viene del body (ni en Create ni en Update): es
// Salary + Bonuses del guardia al momento de crear el pago (ver
// GetEffectivePayrollAmountAsync), la misma idea que Payments.Amount
// con la cuota efectiva de la unidad. Queda fija desde ahí: Update no
// la recalcula aunque cambie StaffId.
//
// Paid es un booleano simple (no un estado con revisión como
// Payments.Status): el usuario no pidió ese nivel de detalle acá.
public class Payroll
{
    private readonly ILogger<Payroll> _logger;

    public Payroll(ILogger<Payroll> logger)
    {
        _logger = logger;
    }

    public record PayrollDto(int Id, int StaffId, DateTime Period, decimal Amount, bool Paid, DateTime CreatedAt);

    private const string SelectColumns = "PayrollId, StaffId, Period, Amount, Paid, CreatedAt";

    private static PayrollDto Read(Microsoft.Data.SqlClient.SqlDataReader reader) => new(
        reader.GetInt32(reader.GetOrdinal("PayrollId")),
        reader.GetInt32(reader.GetOrdinal("StaffId")),
        reader.GetDateTime(reader.GetOrdinal("Period")),
        reader.GetDecimal(reader.GetOrdinal("Amount")),
        reader.GetBoolean(reader.GetOrdinal("Paid")),
        reader.GetDateTime(reader.GetOrdinal("CreatedAt")));

    private static DateTime FirstOfMonth(DateTime date) => new(date.Year, date.Month, 1);

    // Sueldo + bono del guardia al momento de crear el pago. Devuelve
    // null si StaffId no existe. Mismo cálculo que GetEffectiveFeeAsync
    // en Payments.cs, pero sobre SecurityStaff.Salary/Bonuses en vez de
    // Units.FeeAmount/Neighborhoods.DefaultFeeAmount.
    private static async Task<decimal?> GetEffectivePayrollAmountAsync(Microsoft.Data.SqlClient.SqlConnection connection, int staffId)
    {
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT Salary + Bonuses FROM dbo.SecurityStaff WHERE StaffId = @staffId";
        cmd.Parameters.AddWithValue("@staffId", staffId);
        var result = await cmd.ExecuteScalarAsync();
        return result is null or DBNull ? null : (decimal)result;
    }

    [Function("GetPayroll")]
    public async Task<IActionResult> GetList(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "payroll")] HttpRequest req)
    {
        int start = 0, end = 9;
        if (req.Query.TryGetValue("range", out var rangeRaw))
        {
            var range = JsonSerializer.Deserialize<int[]>(rangeRaw.ToString());
            if (range is { Length: 2 })
            {
                start = range[0];
                end = range[1];
            }
        }

        var sortField = "Period";
        var sortDir = "DESC";
        if (req.Query.TryGetValue("sort", out var sortRaw))
        {
            var sort = JsonSerializer.Deserialize<string[]>(sortRaw.ToString());
            if (sort is { Length: 2 })
            {
                sortField = sort[0] switch
                {
                    "id" => "PayrollId",
                    "staffId" => "StaffId",
                    "amount" => "Amount",
                    "paid" => "Paid",
                    "period" => "Period",
                    "createdAt" => "CreatedAt",
                    _ => "Period",
                };
                sortDir = sort[1].Equals("DESC", StringComparison.OrdinalIgnoreCase) ? "DESC" : "ASC";
            }
        }

        // filter.staffId: lo que usa SecurityStaffShow para listar la
        // nómina de un guardia puntual (ReferenceManyField). filter.month /
        // filter.year: mes y año de Period (MONTH(Period)/YEAR(Period)),
        // mismo criterio que Payments.cs/Expenses.cs — lo usa el Panel
        // general para sumar los pagos a guardias del mes en curso dentro
        // del KPI "Gastos del mes".
        int? staffIdFilter = null;
        int? monthFilter = null;
        int? yearFilter = null;
        if (req.Query.TryGetValue("filter", out var filterRaw))
        {
            try
            {
                using var filterDoc = JsonDocument.Parse(filterRaw.ToString());
                if (filterDoc.RootElement.TryGetProperty("staffId", out var sEl) && sEl.TryGetInt32(out var sId))
                {
                    staffIdFilter = sId;
                }
                if (filterDoc.RootElement.TryGetProperty("month", out var mEl) && mEl.TryGetInt32(out var mVal))
                {
                    monthFilter = mVal;
                }
                if (filterDoc.RootElement.TryGetProperty("year", out var yEl) && yEl.TryGetInt32(out var yVal))
                {
                    yearFilter = yVal;
                }
            }
            catch (JsonException)
            {
                // filter mal formado: se ignora en vez de romper la lista.
            }
        }

        var whereClauses = new List<string>();
        if (staffIdFilter is not null)
        {
            whereClauses.Add("StaffId = @staffId");
        }
        if (monthFilter is not null)
        {
            whereClauses.Add("MONTH(Period) = @month");
        }
        if (yearFilter is not null)
        {
            whereClauses.Add("YEAR(Period) = @year");
        }
        var whereSql = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        void AddFilterParams(Microsoft.Data.SqlClient.SqlCommand cmd)
        {
            if (staffIdFilter is not null) cmd.Parameters.AddWithValue("@staffId", staffIdFilter.Value);
            if (monthFilter is not null) cmd.Parameters.AddWithValue("@month", monthFilter.Value);
            if (yearFilter is not null) cmd.Parameters.AddWithValue("@year", yearFilter.Value);
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        int total;
        await using (var countCmd = connection.CreateCommand())
        {
            countCmd.CommandText = $"SELECT COUNT(*) FROM dbo.Payroll {whereSql}";
            AddFilterParams(countCmd);
            total = (int)(await countCmd.ExecuteScalarAsync() ?? 0);
        }

        var records = new List<PayrollDto>();
        await using (var cmd = connection.CreateCommand())
        {
            // sortField sale de un allow-list fijo de arriba, así que esta
            // interpolación es segura (nunca viene directo del usuario).
            cmd.CommandText = $@"
                SELECT {SelectColumns}
                FROM dbo.Payroll
                {whereSql}
                ORDER BY {sortField} {sortDir}
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
            AddFilterParams(cmd);
            cmd.Parameters.AddWithValue("@offset", start);
            cmd.Parameters.AddWithValue("@limit", Math.Max(end - start + 1, 1));

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                records.Add(Read(reader));
            }
        }

        req.HttpContext.Response.Headers["Content-Range"] =
            $"payroll {start}-{Math.Min(end, Math.Max(total - 1, 0))}/{total}";
        req.HttpContext.Response.Headers["Access-Control-Expose-Headers"] = "Content-Range";

        return new OkObjectResult(records);
    }

    [Function("GetPayrollRecord")]
    public async Task<IActionResult> GetOne(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "payroll/{id:int}")] HttpRequest req, int id)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = $"SELECT {SelectColumns} FROM dbo.Payroll WHERE PayrollId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    public record CreatePayrollBody(int StaffId, DateTime Period);

    [Function("CreatePayrollRecord")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "payroll")] HttpRequest req)
    {
        var body = await JsonSerializer.DeserializeAsync<CreatePayrollBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body is null || body.StaffId <= 0)
        {
            return new BadRequestObjectResult(new { error = "StaffId is required.", message = "StaffId is required." });
        }
        if (body.Period == default)
        {
            return new BadRequestObjectResult(new { error = "Period is required.", message = "Period is required." });
        }

        var period = FirstOfMonth(body.Period);

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        var effectiveAmount = await GetEffectivePayrollAmountAsync(connection, body.StaffId);
        if (effectiveAmount is null)
        {
            return new BadRequestObjectResult(new { error = "Guardia inválido.", message = "Guardia inválido." });
        }

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO dbo.Payroll (StaffId, Period, Amount, Paid)
            OUTPUT INSERTED.PayrollId, INSERTED.StaffId, INSERTED.Period, INSERTED.Amount, INSERTED.Paid, INSERTED.CreatedAt
            VALUES (@staffId, @period, @amount, 0)";
        cmd.Parameters.AddWithValue("@staffId", body.StaffId);
        cmd.Parameters.AddWithValue("@period", period);
        cmd.Parameters.AddWithValue("@amount", effectiveAmount.Value);

        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        var created = Read(reader);

        return new CreatedResult($"/api/payroll/{created.Id}", created);
    }

    public record UpdatePayrollBody(int? StaffId, DateTime? Period, bool? Paid);

    [Function("UpdatePayrollRecord")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "payroll/{id:int}")] HttpRequest req, int id)
    {
        var body = await JsonSerializer.DeserializeAsync<UpdatePayrollBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            UPDATE dbo.Payroll
            SET StaffId = COALESCE(@staffId, StaffId),
                Period = COALESCE(@period, Period),
                Paid = COALESCE(@paid, Paid)
            OUTPUT INSERTED.PayrollId, INSERTED.StaffId, INSERTED.Period, INSERTED.Amount, INSERTED.Paid, INSERTED.CreatedAt
            WHERE PayrollId = @id";
        cmd.Parameters.AddWithValue("@staffId", (object?)body?.StaffId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@period", body?.Period is not null ? FirstOfMonth(body.Period.Value) : (object)DBNull.Value);
        cmd.Parameters.AddWithValue("@paid", (object?)body?.Paid ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    [Function("DeletePayrollRecord")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "payroll/{id:int}")] HttpRequest req, int id)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM dbo.Payroll OUTPUT DELETED.PayrollId WHERE PayrollId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        var deletedId = await cmd.ExecuteScalarAsync();
        if (deletedId is null)
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(new { id = (int)deletedId });
    }
}
