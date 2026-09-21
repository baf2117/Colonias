using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Neighborhood.Auth;
using Neighborhood.Database;

namespace Neighborhood;

// CRUD de pagos (dbo.Payments), calcado del patrón de Expenses.cs.
// Period es el mes que cubre el pago (siempre normalizado al día 1 de
// ese mes, sin importar qué día venga en el body) — no hay una fila de
// Fees puntual contra la cual cobrar (se eliminó, ver schema.sql), así
// que Period es lo único que dice "para qué mes es este pago".
//
// Regla central (la que pidió el usuario): una misma unidad no puede
// tener dos pagos "activos" (pending o approved) para el mismo Period
// al mismo tiempo — evita registrar un pago dos veces o cobrar un mes
// que ya está aprobado. Un pago rechazado no cuenta para esta regla: si
// se rechaza un comprobante, la unidad puede volver a intentar para el
// mismo mes. FindConflictingStatusAsync encapsula ese chequeo y lo usan
// tanto Create como Update.
//
// ReceiptBlobPath es opcional por ahora: el flujo real de subida a Blob
// Storage todavía no existe (ver documento de arquitectura), así que
// por ahora es solo una referencia de texto libre que carga el
// administrador a mano. ReviewedByUserId/ReviewedAt nunca vienen del
// body: los resuelve el servidor cuando el Status pasa a approved o
// rejected, a partir del usuario autenticado (mismo patrón que
// RegisteredByUserId en Expenses.cs).
//
// Amount tampoco viene nunca del body (ni en Create ni en Update): es
// la cuota efectiva de la unidad al momento de crear el pago —
// COALESCE(Units.FeeAmount, Neighborhoods.DefaultFeeAmount), la misma
// cuenta que ya usa el dashboard (ver "Cuota de la colonia y de la
// unidad" en el documento de arquitectura) — nunca un monto libre que
// el administrador escriba a mano. GetEffectiveFeeAsync la resuelve al
// crear el pago y queda fija de ahí en más: Update no la toca.
public class Payments
{
    private readonly ILogger<Payments> _logger;

    public Payments(ILogger<Payments> logger)
    {
        _logger = logger;
    }

    public record PaymentDto(
        int Id,
        int UnitId,
        int? ResidentId,
        string? ReceiptBlobPath,
        string Status,
        string? RejectionReason,
        int? ReviewedByUserId,
        DateTime? ReviewedAt,
        decimal Amount,
        DateTime Period,
        DateTime CreatedAt);

    private const string SelectColumns =
        "PaymentId, UnitId, ResidentId, ReceiptBlobPath, Status, RejectionReason, ReviewedByUserId, ReviewedAt, Amount, Period, CreatedAt";

    private static readonly HashSet<string> ValidStatuses = new(StringComparer.OrdinalIgnoreCase) { "pending", "approved", "rejected" };

    private static PaymentDto Read(Microsoft.Data.SqlClient.SqlDataReader reader) => new(
        reader.GetInt32(reader.GetOrdinal("PaymentId")),
        reader.GetInt32(reader.GetOrdinal("UnitId")),
        reader.IsDBNull(reader.GetOrdinal("ResidentId")) ? null : reader.GetInt32(reader.GetOrdinal("ResidentId")),
        reader.IsDBNull(reader.GetOrdinal("ReceiptBlobPath")) ? null : reader.GetString(reader.GetOrdinal("ReceiptBlobPath")),
        reader.GetString(reader.GetOrdinal("Status")),
        reader.IsDBNull(reader.GetOrdinal("RejectionReason")) ? null : reader.GetString(reader.GetOrdinal("RejectionReason")),
        reader.IsDBNull(reader.GetOrdinal("ReviewedByUserId")) ? null : reader.GetInt32(reader.GetOrdinal("ReviewedByUserId")),
        reader.IsDBNull(reader.GetOrdinal("ReviewedAt")) ? null : reader.GetDateTime(reader.GetOrdinal("ReviewedAt")),
        reader.GetDecimal(reader.GetOrdinal("Amount")),
        reader.GetDateTime(reader.GetOrdinal("Period")),
        reader.GetDateTime(reader.GetOrdinal("CreatedAt")));

    private static DateTime FirstOfMonth(DateTime date) => new(date.Year, date.Month, 1);

    // Devuelve el Status del pago activo (pending/approved) que ya ocupa
    // esa unidad+mes, o null si no hay ninguno. excludePaymentId es para
    // que Update no choque contra el propio registro que está editando.
    private static async Task<string?> FindConflictingStatusAsync(
        Microsoft.Data.SqlClient.SqlConnection connection, int unitId, DateTime period, int? excludePaymentId)
    {
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT TOP 1 Status
            FROM dbo.Payments
            WHERE UnitId = @unitId
              AND Period = @period
              AND Status IN ('pending', 'approved')
              AND (@excludeId IS NULL OR PaymentId <> @excludeId)";
        cmd.Parameters.AddWithValue("@unitId", unitId);
        cmd.Parameters.AddWithValue("@period", period);
        cmd.Parameters.AddWithValue("@excludeId", (object?)excludePaymentId ?? DBNull.Value);
        return await cmd.ExecuteScalarAsync() as string;
    }

    private static string ConflictMessage(string conflictingStatus) => conflictingStatus == "approved"
        ? "Esta unidad ya tiene el pago de este mes aprobado."
        : "Esta unidad ya tiene un pago pendiente de revisión para este mes.";

    // Cuota efectiva de la unidad: su propio FeeAmount si tiene uno, si no
    // la cuota general de su colonia. Devuelve null si la unidad no existe
    // (UnitId inválido). Mismo cálculo que ya usa UnitFeeAmountField en el
    // dashboard, pero resuelto acá para fijar el Amount del pago.
    private static async Task<decimal?> GetEffectiveFeeAsync(Microsoft.Data.SqlClient.SqlConnection connection, int unitId)
    {
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT COALESCE(u.FeeAmount, n.DefaultFeeAmount)
            FROM dbo.Units u
            JOIN dbo.Neighborhoods n ON n.NeighborhoodId = u.NeighborhoodId
            WHERE u.UnitId = @unitId";
        cmd.Parameters.AddWithValue("@unitId", unitId);
        var result = await cmd.ExecuteScalarAsync();
        return result is null or DBNull ? null : (decimal)result;
    }

    [Function("GetPayments")]
    public async Task<IActionResult> GetList(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "payments")] HttpRequest req)
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
                    "id" => "PaymentId",
                    "unitId" => "UnitId",
                    "status" => "Status",
                    "amount" => "Amount",
                    "period" => "Period",
                    "createdAt" => "CreatedAt",
                    _ => "Period",
                };
                sortDir = sort[1].Equals("DESC", StringComparison.OrdinalIgnoreCase) ? "DESC" : "ASC";
            }
        }

        // filter.unitId: pagos de una unidad puntual (p.ej. desde UnitShow
        // más adelante). filter.status. filter.month/filter.year: mes y año
        // de Period, mismo criterio que Expenses.cs.
        int? unitIdFilter = null;
        string? statusFilter = null;
        int? monthFilter = null;
        int? yearFilter = null;
        if (req.Query.TryGetValue("filter", out var filterRaw))
        {
            try
            {
                using var filterDoc = JsonDocument.Parse(filterRaw.ToString());
                if (filterDoc.RootElement.TryGetProperty("unitId", out var uEl) && uEl.TryGetInt32(out var uId))
                {
                    unitIdFilter = uId;
                }
                if (filterDoc.RootElement.TryGetProperty("status", out var sEl) && sEl.ValueKind == JsonValueKind.String)
                {
                    statusFilter = sEl.GetString();
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
        if (unitIdFilter is not null)
        {
            whereClauses.Add("UnitId = @unitId");
        }
        if (!string.IsNullOrWhiteSpace(statusFilter))
        {
            whereClauses.Add("Status = @status");
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

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        void AddFilterParams(Microsoft.Data.SqlClient.SqlCommand cmd)
        {
            if (unitIdFilter is not null) cmd.Parameters.AddWithValue("@unitId", unitIdFilter.Value);
            if (!string.IsNullOrWhiteSpace(statusFilter)) cmd.Parameters.AddWithValue("@status", statusFilter);
            if (monthFilter is not null) cmd.Parameters.AddWithValue("@month", monthFilter.Value);
            if (yearFilter is not null) cmd.Parameters.AddWithValue("@year", yearFilter.Value);
        }

        int total;
        await using (var countCmd = connection.CreateCommand())
        {
            countCmd.CommandText = $"SELECT COUNT(*) FROM dbo.Payments {whereSql}";
            AddFilterParams(countCmd);
            total = (int)(await countCmd.ExecuteScalarAsync() ?? 0);
        }

        var payments = new List<PaymentDto>();
        await using (var cmd = connection.CreateCommand())
        {
            // sortField sale de un allow-list fijo de arriba, así que esta
            // interpolación es segura (nunca viene directo del usuario).
            cmd.CommandText = $@"
                SELECT {SelectColumns}
                FROM dbo.Payments
                {whereSql}
                ORDER BY {sortField} {sortDir}
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
            AddFilterParams(cmd);
            cmd.Parameters.AddWithValue("@offset", start);
            cmd.Parameters.AddWithValue("@limit", Math.Max(end - start + 1, 1));

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                payments.Add(Read(reader));
            }
        }

        req.HttpContext.Response.Headers["Content-Range"] =
            $"payments {start}-{Math.Min(end, Math.Max(total - 1, 0))}/{total}";
        req.HttpContext.Response.Headers["Access-Control-Expose-Headers"] = "Content-Range";

        return new OkObjectResult(payments);
    }

    [Function("GetPayment")]
    public async Task<IActionResult> GetOne(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "payments/{id:int}")] HttpRequest req, int id)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = $"SELECT {SelectColumns} FROM dbo.Payments WHERE PaymentId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    public record CreatePaymentBody(int UnitId, int? ResidentId, string? ReceiptBlobPath, string? Status, string? RejectionReason, DateTime Period);

    [Function("CreatePayment")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "payments")] HttpRequest req)
    {
        var body = await JsonSerializer.DeserializeAsync<CreatePaymentBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body is null || body.UnitId <= 0)
        {
            return new BadRequestObjectResult(new { error = "UnitId is required.", message = "UnitId is required." });
        }
        if (body.Period == default)
        {
            return new BadRequestObjectResult(new { error = "Period is required.", message = "Period is required." });
        }

        var status = string.IsNullOrWhiteSpace(body.Status) ? "pending" : body.Status.ToLowerInvariant();
        if (!ValidStatuses.Contains(status))
        {
            return new BadRequestObjectResult(new { error = "Status must be 'pending', 'approved' or 'rejected'.", message = "Status must be 'pending', 'approved' or 'rejected'." });
        }

        var period = FirstOfMonth(body.Period);

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        // La regla central: no se puede registrar un segundo pago activo
        // para la misma unidad y el mismo mes.
        if (status is "pending" or "approved")
        {
            var conflict = await FindConflictingStatusAsync(connection, body.UnitId, period, excludePaymentId: null);
            if (conflict is not null)
            {
                return new ConflictObjectResult(new { error = ConflictMessage(conflict), message = ConflictMessage(conflict) });
            }
        }

        var effectiveAmount = await GetEffectiveFeeAsync(connection, body.UnitId);
        if (effectiveAmount is null)
        {
            return new BadRequestObjectResult(new { error = "Unidad inválida.", message = "Unidad inválida." });
        }

        // Si el administrador lo registra directamente como aprobado o
        // rechazado (ya lo revisó al momento de cargarlo), queda asentado
        // como revisado por quien lo está creando.
        var currentUser = req.HttpContext.GetCurrentUser();
        var reviewedByUserId = status == "pending" ? (int?)null : currentUser?.ResidentId;
        var reviewedAt = status == "pending" ? (DateTime?)null : DateTime.UtcNow;

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO dbo.Payments (UnitId, ResidentId, ReceiptBlobPath, Status, RejectionReason, ReviewedByUserId, ReviewedAt, Amount, Period)
            OUTPUT
                INSERTED.PaymentId, INSERTED.UnitId, INSERTED.ResidentId, INSERTED.ReceiptBlobPath, INSERTED.Status,
                INSERTED.RejectionReason, INSERTED.ReviewedByUserId, INSERTED.ReviewedAt, INSERTED.Amount,
                INSERTED.Period, INSERTED.CreatedAt
            VALUES (@unitId, @residentId, @receiptBlobPath, @status, @rejectionReason, @reviewedByUserId, @reviewedAt, @amount, @period)";
        cmd.Parameters.AddWithValue("@unitId", body.UnitId);
        cmd.Parameters.AddWithValue("@residentId", (object?)body.ResidentId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@receiptBlobPath", (object?)body.ReceiptBlobPath ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@status", status);
        cmd.Parameters.AddWithValue("@rejectionReason", (object?)body.RejectionReason ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@reviewedByUserId", (object?)reviewedByUserId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@reviewedAt", (object?)reviewedAt ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@amount", effectiveAmount.Value);
        cmd.Parameters.AddWithValue("@period", period);

        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        var created = Read(reader);

        return new CreatedResult($"/api/payments/{created.Id}", created);
    }

    public record UpdatePaymentBody(int? UnitId, int? ResidentId, string? ReceiptBlobPath, string? Status, string? RejectionReason, DateTime? Period);

    [Function("UpdatePayment")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "payments/{id:int}")] HttpRequest req, int id)
    {
        var body = await JsonSerializer.DeserializeAsync<UpdatePaymentBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        var normalizedStatus = body?.Status is null ? null : body.Status.ToLowerInvariant();
        if (normalizedStatus is not null && !ValidStatuses.Contains(normalizedStatus))
        {
            return new BadRequestObjectResult(new { error = "Status must be 'pending', 'approved' or 'rejected'.", message = "Status must be 'pending', 'approved' or 'rejected'." });
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        // Hace falta el estado actual para: (a) saber contra qué mes/unidad
        // chequear conflictos cuando el body no manda esos campos, y (b)
        // decidir si esta actualización es una revisión nueva (pending ->
        // approved/rejected) que debe registrar quién y cuándo la hizo.
        string currentUnitIdRaw, currentStatus;
        DateTime currentPeriod;
        await using (var currentCmd = connection.CreateCommand())
        {
            currentCmd.CommandText = "SELECT UnitId, Status, Period FROM dbo.Payments WHERE PaymentId = @id";
            currentCmd.Parameters.AddWithValue("@id", id);
            await using var currentReader = await currentCmd.ExecuteReaderAsync();
            if (!await currentReader.ReadAsync())
            {
                return new NotFoundResult();
            }
            currentUnitIdRaw = currentReader.GetInt32(currentReader.GetOrdinal("UnitId")).ToString();
            currentStatus = currentReader.GetString(currentReader.GetOrdinal("Status"));
            currentPeriod = currentReader.GetDateTime(currentReader.GetOrdinal("Period"));
        }

        var effectiveUnitId = body?.UnitId ?? int.Parse(currentUnitIdRaw);
        var effectivePeriod = body?.Period is not null ? FirstOfMonth(body.Period.Value) : currentPeriod;
        var effectiveStatus = normalizedStatus ?? currentStatus;

        if (effectiveStatus is "pending" or "approved")
        {
            var conflict = await FindConflictingStatusAsync(connection, effectiveUnitId, effectivePeriod, excludePaymentId: id);
            if (conflict is not null)
            {
                return new ConflictObjectResult(new { error = ConflictMessage(conflict), message = ConflictMessage(conflict) });
            }
        }

        // Solo se asienta una revisión nueva cuando el Status realmente
        // cambia de pending a approved/rejected en esta llamada — así una
        // edición que no toca Status (p.ej. corregir el RejectionReason) no
        // le "roba" la revisión a quien ya lo había aprobado antes.
        var isNewReview = normalizedStatus is not null && normalizedStatus != "pending" && normalizedStatus != currentStatus;
        var currentUser = req.HttpContext.GetCurrentUser();

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            UPDATE dbo.Payments
            SET UnitId = COALESCE(@unitId, UnitId),
                ResidentId = COALESCE(@residentId, ResidentId),
                ReceiptBlobPath = @receiptBlobPath,
                Status = COALESCE(@status, Status),
                RejectionReason = @rejectionReason,
                ReviewedByUserId = CASE WHEN @isNewReview = 1 THEN @reviewedByUserId ELSE ReviewedByUserId END,
                ReviewedAt = CASE WHEN @isNewReview = 1 THEN @reviewedAt ELSE ReviewedAt END,
                Period = COALESCE(@period, Period)
            OUTPUT
                INSERTED.PaymentId, INSERTED.UnitId, INSERTED.ResidentId, INSERTED.ReceiptBlobPath, INSERTED.Status,
                INSERTED.RejectionReason, INSERTED.ReviewedByUserId, INSERTED.ReviewedAt, INSERTED.Amount,
                INSERTED.Period, INSERTED.CreatedAt
            WHERE PaymentId = @id";
        cmd.Parameters.AddWithValue("@unitId", (object?)body?.UnitId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@residentId", (object?)body?.ResidentId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@receiptBlobPath", (object?)body?.ReceiptBlobPath ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@status", (object?)normalizedStatus ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@rejectionReason", (object?)body?.RejectionReason ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@isNewReview", isNewReview);
        cmd.Parameters.AddWithValue("@reviewedByUserId", (object?)currentUser?.ResidentId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@reviewedAt", DateTime.UtcNow);
        cmd.Parameters.AddWithValue("@period", body?.Period is not null ? FirstOfMonth(body.Period.Value) : (object)DBNull.Value);
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    [Function("DeletePayment")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "payments/{id:int}")] HttpRequest req, int id)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM dbo.Payments OUTPUT DELETED.PaymentId WHERE PaymentId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        var deletedId = await cmd.ExecuteScalarAsync();
        if (deletedId is null)
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(new { id = (int)deletedId });
    }
}
