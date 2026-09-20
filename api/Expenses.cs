using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Neighborhood.Auth;
using Neighborhood.Database;

namespace Neighborhood;

// CRUD de gastos (dbo.Expenses), calcado del patrón de Units.cs. Todo
// gasto pertenece a un proveedor (VendorId NOT NULL — antes era NULL,
// se hizo obligatorio junto con esta funcionalidad): la colonia del
// gasto se resuelve indirectamente a través de Vendors.NeighborhoodId,
// igual que Residents la resuelve a través de Units, así que Expenses
// no lleva su propia columna de colonia.
//
// RegisteredByUserId (NOT NULL) nunca viaja en el body del request: se
// resuelve del lado del servidor a partir del usuario autenticado
// (HttpContext.GetCurrentUser(), la misma extensión que usa Me.cs), así
// que no hace falta ni se puede falsificar quién registró el gasto.
//
// ReceiptBlobPath (comprobante en Blob Storage) todavía no tiene flujo
// de subida implementado — mismo estado pendiente que en Payments, ver
// el documento de arquitectura — así que no aparece en el DTO todavía.
public class Expenses
{
    private readonly ILogger<Expenses> _logger;

    public Expenses(ILogger<Expenses> logger)
    {
        _logger = logger;
    }

    public record ExpenseDto(int Id, int VendorId, string? Category, decimal Amount, string? Description, DateTime Date, int RegisteredByUserId);

    private const string SelectColumns = "ExpenseId, VendorId, Category, Amount, Description, Date, RegisteredByUserId";

    private static ExpenseDto Read(Microsoft.Data.SqlClient.SqlDataReader reader) => new(
        reader.GetInt32(reader.GetOrdinal("ExpenseId")),
        reader.GetInt32(reader.GetOrdinal("VendorId")),
        reader.IsDBNull(reader.GetOrdinal("Category")) ? null : reader.GetString(reader.GetOrdinal("Category")),
        reader.GetDecimal(reader.GetOrdinal("Amount")),
        reader.IsDBNull(reader.GetOrdinal("Description")) ? null : reader.GetString(reader.GetOrdinal("Description")),
        reader.GetDateTime(reader.GetOrdinal("Date")),
        reader.GetInt32(reader.GetOrdinal("RegisteredByUserId")));

    [Function("GetExpenses")]
    public async Task<IActionResult> GetList(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "expenses")] HttpRequest req)
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

        var sortField = "Date";
        var sortDir = "DESC";
        if (req.Query.TryGetValue("sort", out var sortRaw))
        {
            var sort = JsonSerializer.Deserialize<string[]>(sortRaw.ToString());
            if (sort is { Length: 2 })
            {
                sortField = sort[0] switch
                {
                    "id" => "ExpenseId",
                    "vendorId" => "VendorId",
                    "category" => "Category",
                    "amount" => "Amount",
                    "date" => "Date",
                    _ => "Date",
                };
                sortDir = sort[1].Equals("DESC", StringComparison.OrdinalIgnoreCase) ? "DESC" : "ASC";
            }
        }

        // filter.vendorId: lo que arma la agrupación por proveedor desde el
        // dashboard (un filtro en la lista, no un GROUP BY). filter.month /
        // filter.year: filtro por mes y año del gasto (MONTH(Date)/YEAR(Date),
        // cualquiera de los dos es independiente del otro) — ver
        // ExpenseList.tsx.
        int? vendorIdFilter = null;
        int? monthFilter = null;
        int? yearFilter = null;
        if (req.Query.TryGetValue("filter", out var filterRaw))
        {
            try
            {
                using var filterDoc = JsonDocument.Parse(filterRaw.ToString());
                if (filterDoc.RootElement.TryGetProperty("vendorId", out var vEl) && vEl.TryGetInt32(out var vId))
                {
                    vendorIdFilter = vId;
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
        if (vendorIdFilter is not null)
        {
            whereClauses.Add("VendorId = @vendorId");
        }
        if (monthFilter is not null)
        {
            whereClauses.Add("MONTH(Date) = @month");
        }
        if (yearFilter is not null)
        {
            whereClauses.Add("YEAR(Date) = @year");
        }
        var whereSql = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        int total;
        await using (var countCmd = connection.CreateCommand())
        {
            countCmd.CommandText = $"SELECT COUNT(*) FROM dbo.Expenses {whereSql}";
            if (vendorIdFilter is not null)
            {
                countCmd.Parameters.AddWithValue("@vendorId", vendorIdFilter.Value);
            }
            if (monthFilter is not null)
            {
                countCmd.Parameters.AddWithValue("@month", monthFilter.Value);
            }
            if (yearFilter is not null)
            {
                countCmd.Parameters.AddWithValue("@year", yearFilter.Value);
            }
            total = (int)(await countCmd.ExecuteScalarAsync() ?? 0);
        }

        var expenses = new List<ExpenseDto>();
        await using (var cmd = connection.CreateCommand())
        {
            // sortField sale de un allow-list fijo de arriba, así que esta
            // interpolación es segura (nunca viene directo del usuario).
            cmd.CommandText = $@"
                SELECT {SelectColumns}
                FROM dbo.Expenses
                {whereSql}
                ORDER BY {sortField} {sortDir}
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
            if (vendorIdFilter is not null)
            {
                cmd.Parameters.AddWithValue("@vendorId", vendorIdFilter.Value);
            }
            if (monthFilter is not null)
            {
                cmd.Parameters.AddWithValue("@month", monthFilter.Value);
            }
            if (yearFilter is not null)
            {
                cmd.Parameters.AddWithValue("@year", yearFilter.Value);
            }
            cmd.Parameters.AddWithValue("@offset", start);
            cmd.Parameters.AddWithValue("@limit", Math.Max(end - start + 1, 1));

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                expenses.Add(Read(reader));
            }
        }

        req.HttpContext.Response.Headers["Content-Range"] =
            $"expenses {start}-{Math.Min(end, Math.Max(total - 1, 0))}/{total}";
        req.HttpContext.Response.Headers["Access-Control-Expose-Headers"] = "Content-Range";

        return new OkObjectResult(expenses);
    }

    [Function("GetExpense")]
    public async Task<IActionResult> GetOne(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "expenses/{id:int}")] HttpRequest req, int id)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = $"SELECT {SelectColumns} FROM dbo.Expenses WHERE ExpenseId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    public record CreateExpenseBody(int VendorId, string? Category, decimal Amount, string? Description, DateTime Date);

    [Function("CreateExpense")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "expenses")] HttpRequest req)
    {
        var currentUser = req.HttpContext.GetCurrentUser();
        if (currentUser is null)
        {
            _logger.LogWarning("CreateExpense called without a resolved CurrentUser in HttpContext.");
            return new UnauthorizedObjectResult(new { error = "No authenticated user found." });
        }

        var body = await JsonSerializer.DeserializeAsync<CreateExpenseBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body is null || body.VendorId <= 0)
        {
            return new BadRequestObjectResult(new { error = "VendorId is required." });
        }

        if (body.Amount <= 0)
        {
            return new BadRequestObjectResult(new { error = "Amount must be greater than zero." });
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO dbo.Expenses (VendorId, Category, Amount, Description, Date, RegisteredByUserId)
            OUTPUT INSERTED.ExpenseId, INSERTED.VendorId, INSERTED.Category, INSERTED.Amount,
                   INSERTED.Description, INSERTED.Date, INSERTED.RegisteredByUserId
            VALUES (@vendorId, @category, @amount, @description, @date, @registeredByUserId)";
        cmd.Parameters.AddWithValue("@vendorId", body.VendorId);
        cmd.Parameters.AddWithValue("@category", (object?)body.Category ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@amount", body.Amount);
        cmd.Parameters.AddWithValue("@description", (object?)body.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@date", body.Date == default ? DateTime.UtcNow.Date : body.Date.Date);
        cmd.Parameters.AddWithValue("@registeredByUserId", currentUser.ResidentId);

        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        var created = Read(reader);

        return new CreatedResult($"/api/expenses/{created.Id}", created);
    }

    // VendorId/Amount/Date siempre vienen del formulario (COALESCE);
    // Category/Description son de texto libre y opcionales, así que se
    // asignan directo — igual que Address en UpdateUnit — para poder
    // vaciarlos desde el formulario de edición. RegisteredByUserId nunca
    // se actualiza: queda fijo a quien registró el gasto originalmente.
    public record UpdateExpenseBody(int? VendorId, string? Category, decimal? Amount, string? Description, DateTime? Date);

    [Function("UpdateExpense")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "expenses/{id:int}")] HttpRequest req, int id)
    {
        var body = await JsonSerializer.DeserializeAsync<UpdateExpenseBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            UPDATE dbo.Expenses
            SET VendorId = COALESCE(@vendorId, VendorId),
                Category = @category,
                Amount = COALESCE(@amount, Amount),
                Description = @description,
                Date = COALESCE(@date, Date)
            OUTPUT INSERTED.ExpenseId, INSERTED.VendorId, INSERTED.Category, INSERTED.Amount,
                   INSERTED.Description, INSERTED.Date, INSERTED.RegisteredByUserId
            WHERE ExpenseId = @id";
        cmd.Parameters.AddWithValue("@vendorId", (object?)body?.VendorId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@category", (object?)body?.Category ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@amount", (object?)body?.Amount ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@description", (object?)body?.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@date", (object?)body?.Date ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    [Function("DeleteExpense")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "expenses/{id:int}")] HttpRequest req, int id)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM dbo.Expenses OUTPUT DELETED.ExpenseId WHERE ExpenseId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        var deletedId = await cmd.ExecuteScalarAsync();
        if (deletedId is null)
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(new { id = (int)deletedId });
    }
}
