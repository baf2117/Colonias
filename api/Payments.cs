using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Neighborhood.Auth;
using Neighborhood.Database;
using Neighborhood.Email;
using Neighborhood.Storage;

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
        DateTime CreatedAt,
        string? ReviewedByName);

    // Con alias p (Payments), porque el LEFT JOIN con Residents (para
    // ReviewedByName -- ver más abajo) agrega una tabla con columnas
    // propias (Residents.UnitId, entre otras) que chocarían con las de
    // Payments sin el alias. El JOIN es LEFT porque ReviewedByUserId es
    // opcional (un pago "pending" todavía no tiene revisor).
    private const string SelectColumns =
        "p.PaymentId, p.UnitId, p.ResidentId, p.ReceiptBlobPath, p.Status, p.RejectionReason, p.ReviewedByUserId, p.ReviewedAt, p.Amount, p.Period, p.CreatedAt, r.Name AS ReviewedByName";

    private static readonly HashSet<string> ValidStatuses = new(StringComparer.OrdinalIgnoreCase) { "pending", "approved", "rejected" };

    // true si el reader tiene esa columna -- Create/Update leen el
    // resultado de un OUTPUT INSERTED/DELETED (no puede hacer JOIN), así
    // que ReviewedByName no está ahí; GetList/GetOne/GetReceiptViewUrl sí
    // la traen (SelectColumns con el JOIN a Residents).
    private static bool HasColumn(Microsoft.Data.SqlClient.SqlDataReader reader, string columnName)
    {
        for (var i = 0; i < reader.FieldCount; i++)
        {
            if (reader.GetName(i).Equals(columnName, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }

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
        reader.GetDateTime(reader.GetOrdinal("CreatedAt")),
        HasColumn(reader, "ReviewedByName") && !reader.IsDBNull(reader.GetOrdinal("ReviewedByName"))
            ? reader.GetString(reader.GetOrdinal("ReviewedByName"))
            : null);

    // Resuelve el nombre de un residente puntual -- se usa para
    // completar ReviewedByName después de un Create/Update, cuyo OUTPUT
    // INSERTED no puede traerlo directo (ver Read/HasColumn arriba).
    private static async Task<string?> GetResidentNameAsync(Microsoft.Data.SqlClient.SqlConnection connection, int? residentId)
    {
        if (residentId is null)
        {
            return null;
        }
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT Name FROM dbo.Residents WHERE ResidentId = @id";
        cmd.Parameters.AddWithValue("@id", residentId.Value);
        return await cmd.ExecuteScalarAsync() as string;
    }

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

    // Mismo criterio y misma forma que ResolveNeighborhoodScope en
    // Units.cs/Residents.cs/Vendors.cs (se duplica, cada recurso es
    // autocontenido): un SuperAdministrador ve todos los pagos de
    // cualquier colonia; un Administrador queda SIEMPRE acotado a la
    // suya (currentUser.NeighborhoodId), resuelta vía Payments.UnitId ->
    // Units.NeighborhoodId (Payments no tiene NeighborhoodId propio).
    // Antes de esto, un Administrador veía los pagos de TODAS las
    // colonias -- el único recurso al que se le había olvidado aplicar
    // este scoping -- y encima UnitFilter/ReferenceField no podían
    // resolver la unidad de un pago ajeno a su colonia (Units.cs ya
    // estaba scoped), así que se veía "sin unidad" en la lista.
    private readonly record struct NeighborhoodScope(bool IsScoped, int? NeighborhoodId);

    private static NeighborhoodScope ResolveNeighborhoodScope(HttpRequest req)
    {
        var currentUser = req.HttpContext.GetCurrentUser();
        if (currentUser is null || currentUser.SuperAdministrador)
        {
            return new NeighborhoodScope(false, null);
        }
        return new NeighborhoodScope(true, currentUser.NeighborhoodId);
    }

    private static async Task<int?> FindUnitNeighborhoodIdAsync(Microsoft.Data.SqlClient.SqlConnection connection, int unitId)
    {
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT NeighborhoodId FROM dbo.Units WHERE UnitId = @unitId";
        cmd.Parameters.AddWithValue("@unitId", unitId);
        var result = await cmd.ExecuteScalarAsync();
        return result is null or DBNull ? null : (int)result;
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
                    "id" => "p.PaymentId",
                    "unitId" => "p.UnitId",
                    "status" => "p.Status",
                    "amount" => "p.Amount",
                    "period" => "p.Period",
                    "createdAt" => "p.CreatedAt",
                    _ => "p.Period",
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

        // Un residente "puro" (Residente = true, sin Administrador ni
        // SuperAdministrador) solo puede ver los pagos de su propia
        // unidad: se ignora cualquier filter.unitId que mande el cliente y
        // se fuerza el suyo (CurrentUser.UnitId), para que no pueda ver
        // los pagos de otra unidad manipulando la query string — mismo
        // criterio de "seguridad a nivel de fila resuelta en el código"
        // que ya documenta el proyecto en vez de RLS de motor. Un
        // administrador o superadministrador (aunque también sea
        // Residente) sigue viendo todo, igual que antes. Sin unidad
        // asignada, un residente puro no tiene nada que ver: se corta acá
        // mismo con una lista vacía en vez de armar una consulta que de
        // todos modos no va a matchear ningún UnitId.
        var currentUser = req.HttpContext.GetCurrentUser();
        var isPureResident = currentUser is not null && currentUser.Residente && !currentUser.Administrador && !currentUser.SuperAdministrador;
        if (isPureResident)
        {
            if (currentUser!.UnitId is null)
            {
                req.HttpContext.Response.Headers["Content-Range"] = "payments 0-0/0";
                req.HttpContext.Response.Headers["Access-Control-Expose-Headers"] = "Content-Range";
                return new OkObjectResult(Array.Empty<PaymentDto>());
            }
            unitIdFilter = currentUser.UnitId;
        }

        // Un Administrador (no puro residente, ya cubierto arriba) queda
        // acotado a su propia colonia -- antes de esto veía los pagos de
        // TODAS las colonias, el único recurso al que le faltaba este
        // scoping (Units.cs/Residents.cs/Vendors.cs ya lo tenían). Sin
        // colonia asignada todavía, no ve ningún pago (mismo criterio que
        // esos otros recursos).
        var scope = ResolveNeighborhoodScope(req);
        if (scope.IsScoped && scope.NeighborhoodId is null)
        {
            req.HttpContext.Response.Headers["Content-Range"] = "payments 0-0/0";
            req.HttpContext.Response.Headers["Access-Control-Expose-Headers"] = "Content-Range";
            return new OkObjectResult(Array.Empty<PaymentDto>());
        }

        // Todas prefijadas con p. (alias de Payments): el LEFT JOIN a
        // Residents para ReviewedByName agrega una tabla que también
        // tiene columna UnitId, así que "UnitId = @unitId" a secas sería
        // ambiguo para SQL Server.
        var whereClauses = new List<string>();
        if (unitIdFilter is not null)
        {
            whereClauses.Add("p.UnitId = @unitId");
        }
        if (!string.IsNullOrWhiteSpace(statusFilter))
        {
            whereClauses.Add("p.Status = @status");
        }
        if (monthFilter is not null)
        {
            whereClauses.Add("MONTH(p.Period) = @month");
        }
        if (yearFilter is not null)
        {
            whereClauses.Add("YEAR(p.Period) = @year");
        }
        if (scope.IsScoped)
        {
            whereClauses.Add("EXISTS (SELECT 1 FROM dbo.Units U WHERE U.UnitId = p.UnitId AND U.NeighborhoodId = @scopeNeighborhoodId)");
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
            if (scope.IsScoped) cmd.Parameters.AddWithValue("@scopeNeighborhoodId", scope.NeighborhoodId!.Value);
        }

        int total;
        await using (var countCmd = connection.CreateCommand())
        {
            countCmd.CommandText = $"SELECT COUNT(*) FROM dbo.Payments p {whereSql}";
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
                FROM dbo.Payments p
                LEFT JOIN dbo.Residents r ON r.ResidentId = p.ReviewedByUserId
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
        cmd.CommandText = $@"
            SELECT {SelectColumns}
            FROM dbo.Payments p
            LEFT JOIN dbo.Residents r ON r.ResidentId = p.ReviewedByUserId
            WHERE p.PaymentId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        var payment = Read(reader);

        // Mismo bloqueo por fila que GetList: un residente puro no puede
        // pedir un pago de otra unidad por id, ni siquiera adivinando el
        // número — 404, no 403, para no confirmar que ese id existe.
        var currentUser = req.HttpContext.GetCurrentUser();
        var isPureResident = currentUser is not null && currentUser.Residente && !currentUser.Administrador && !currentUser.SuperAdministrador;
        if (isPureResident && payment.UnitId != currentUser!.UnitId)
        {
            return new NotFoundResult();
        }

        var scope = ResolveNeighborhoodScope(req);
        if (scope.IsScoped)
        {
            var unitNeighborhoodId = await FindUnitNeighborhoodIdAsync(connection, payment.UnitId);
            if (unitNeighborhoodId is null || unitNeighborhoodId != scope.NeighborhoodId)
            {
                return new NotFoundResult();
            }
        }

        return new OkObjectResult(payment);
    }

    public record CreatePaymentBody(int UnitId, int? ResidentId, string? ReceiptBlobPath, string? Status, string? RejectionReason, DateTime Period);

    [Function("CreatePayment")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "payments")] HttpRequest req)
    {
        var body = await JsonSerializer.DeserializeAsync<CreatePaymentBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body is null)
        {
            return new BadRequestObjectResult(new { error = "UnitId is required.", message = "UnitId is required." });
        }
        if (body.Period == default)
        {
            return new BadRequestObjectResult(new { error = "Period is required.", message = "Period is required." });
        }

        // Un residente puro (Residente=true, sin Administrador ni
        // SuperAdministrador) no elige unidad, residente, estado ni motivo
        // de rechazo al cargar su comprobante: el servidor los fuerza a
        // partir de GetCurrentUser() e ignora lo que mande el body para
        // esos cuatro campos, en vez de confiar en que el frontend los
        // oculte -- mismo criterio de "seguridad a nivel de fila resuelta
        // en el código" que ya aplican GetList/GetOne (ver
        // arquitectura-infraestructura.md). Un pago cargado así siempre
        // queda "pending": revisarlo y ponerle un motivo de rechazo es
        // trabajo del administrador desde PaymentEdit, no de quien lo sube.
        var currentUser = req.HttpContext.GetCurrentUser();
        var isPureResident = currentUser is not null && currentUser.Residente && !currentUser.Administrador && !currentUser.SuperAdministrador;

        int unitId;
        int? residentId;
        string status;
        string? rejectionReason;

        if (isPureResident)
        {
            if (currentUser!.UnitId is null)
            {
                return new BadRequestObjectResult(new { error = "No tenés una unidad asignada.", message = "No tenés una unidad asignada." });
            }
            unitId = currentUser.UnitId.Value;
            residentId = currentUser.ResidentId;
            status = "pending";
            rejectionReason = null;
        }
        else
        {
            if (body.UnitId <= 0)
            {
                return new BadRequestObjectResult(new { error = "UnitId is required.", message = "UnitId is required." });
            }
            unitId = body.UnitId;
            residentId = body.ResidentId;
            status = string.IsNullOrWhiteSpace(body.Status) ? "pending" : body.Status.ToLowerInvariant();
            if (!ValidStatuses.Contains(status))
            {
                return new BadRequestObjectResult(new { error = "Status must be 'pending', 'approved' or 'rejected'.", message = "Status must be 'pending', 'approved' or 'rejected'." });
            }
            rejectionReason = body.RejectionReason;
        }

        // Un residente puro solo puede asociar a su pago un comprobante
        // que él mismo subió a SU carpeta ("{unitId}/...", ver
        // GetPaymentReceiptUploadUrl/BlobStorageService.cs) -- si de
        // algún modo llegara un receiptBlobPath de otra unidad (a mano,
        // por API), se ignora en silencio en vez de guardarlo. Un
        // administrador o superadministrador puede seguir mandando
        // cualquier ruta, igual que antes.
        var receiptBlobPath = body.ReceiptBlobPath;
        if (isPureResident && receiptBlobPath is not null && !receiptBlobPath.StartsWith($"{unitId}/", StringComparison.Ordinal))
        {
            receiptBlobPath = null;
        }

        var period = FirstOfMonth(body.Period);

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        // Un Administrador solo puede cargar/registrar pagos de una
        // unidad de SU colonia -- mismo criterio que Vendors.cs/Create al
        // validar la colonia de un proveedor. Un residente puro ya viene
        // con su propia unidad forzada arriba, así que esto solo aplica
        // al else de arriba (administrador/superadministrador).
        var scope = ResolveNeighborhoodScope(req);
        if (scope.IsScoped)
        {
            var unitNeighborhoodId = await FindUnitNeighborhoodIdAsync(connection, unitId);
            if (unitNeighborhoodId is null || unitNeighborhoodId != scope.NeighborhoodId)
            {
                return new BadRequestObjectResult(new { error = "Esa unidad no pertenece a tu colonia.", message = "Esa unidad no pertenece a tu colonia." });
            }
        }

        // La regla central: no se puede registrar un segundo pago activo
        // para la misma unidad y el mismo mes.
        if (status is "pending" or "approved")
        {
            var conflict = await FindConflictingStatusAsync(connection, unitId, period, excludePaymentId: null);
            if (conflict is not null)
            {
                return new ConflictObjectResult(new { error = ConflictMessage(conflict), message = ConflictMessage(conflict) });
            }
        }

        var effectiveAmount = await GetEffectiveFeeAsync(connection, unitId);
        if (effectiveAmount is null)
        {
            return new BadRequestObjectResult(new { error = "Unidad inválida.", message = "Unidad inválida." });
        }

        // Si el administrador lo registra directamente como aprobado o
        // rechazado (ya lo revisó al momento de cargarlo), queda asentado
        // como revisado por quien lo está creando. Un residente puro nunca
        // llega acá con otro estado que no sea "pending" (forzado arriba).
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
        cmd.Parameters.AddWithValue("@unitId", unitId);
        cmd.Parameters.AddWithValue("@residentId", (object?)residentId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@receiptBlobPath", (object?)receiptBlobPath ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@status", status);
        cmd.Parameters.AddWithValue("@rejectionReason", (object?)rejectionReason ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@reviewedByUserId", (object?)reviewedByUserId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@reviewedAt", (object?)reviewedAt ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@amount", effectiveAmount.Value);
        cmd.Parameters.AddWithValue("@period", period);

        PaymentDto created;
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            await reader.ReadAsync();
            created = Read(reader);
        }

        // El OUTPUT INSERTED de arriba no puede hacer JOIN, así que
        // ReviewedByName todavía viene null acá (ver Read/HasColumn) --
        // solo hace falta resolverlo cuando un administrador crea el pago
        // ya revisado (approved/rejected directo); un residente puro
        // siempre crea en "pending", sin revisor.
        if (created.ReviewedByUserId is not null)
        {
            var reviewerName = await GetResidentNameAsync(connection, created.ReviewedByUserId);
            created = created with { ReviewedByName = reviewerName };
        }

        return new CreatedResult($"/api/payments/{created.Id}", created);
    }

    public record ReceiptUploadUrlBody(int UnitId, string Extension);
    public record ReceiptUploadUrlDto(string UploadUrl, string BlobPath, DateTimeOffset ExpiresAt);
    public record ReceiptViewUrlDto(string Url, DateTimeOffset ExpiresAt);

    // Paso previo a CreatePayment: el que sube el comprobante primero
    // pide esta URL, sube el archivo directo a Blob Storage con ella (sin
    // pasar por el Function, ver BlobStorageService.cs), y recién ahí
    // manda el CreatePayment normal con `receiptBlobPath` ya resuelto --
    // así el registro en dbo.Payments nunca queda "a medias" (creado sin
    // comprobante todavía, o con un comprobante que nunca se llegó a
    // subir). Un residente puro no elige unidad ni nombre de archivo: se
    // le fuerza la unidad (currentUser.UnitId) y el nombre del blob se
    // genera acá con un GUID nuevo, mismo criterio de "seguridad a nivel
    // de fila resuelta en el código" que ya usan GetList/GetOne/CreatePayment.
    [Function("GetPaymentReceiptUploadUrl")]
    public async Task<IActionResult> GetReceiptUploadUrl(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "payments/receipt-upload-url")] HttpRequest req)
    {
        var body = await JsonSerializer.DeserializeAsync<ReceiptUploadUrlBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body is null || string.IsNullOrWhiteSpace(body.Extension))
        {
            return new BadRequestObjectResult(new { error = "Extension is required.", message = "Extension is required." });
        }

        var extension = body.Extension.TrimStart('.').ToLowerInvariant();
        if (!BlobStorageService.AllowedExtensions.Contains(extension))
        {
            return new BadRequestObjectResult(new { error = "Formato de archivo no permitido.", message = "Formato de archivo no permitido." });
        }

        var currentUser = req.HttpContext.GetCurrentUser();
        var isPureResident = currentUser is not null && currentUser.Residente && !currentUser.Administrador && !currentUser.SuperAdministrador;

        int unitId;
        if (isPureResident)
        {
            if (currentUser!.UnitId is null)
            {
                return new BadRequestObjectResult(new { error = "No tenés una unidad asignada.", message = "No tenés una unidad asignada." });
            }
            unitId = currentUser.UnitId.Value;
        }
        else
        {
            if (body.UnitId <= 0)
            {
                return new BadRequestObjectResult(new { error = "UnitId is required.", message = "UnitId is required." });
            }
            unitId = body.UnitId;
        }

        var blobPath = BlobStorageService.NewBlobPath(unitId, extension);
        var (uploadUrl, expiresAt) = BlobStorageService.GetUploadUrl(blobPath);

        return new OkObjectResult(new ReceiptUploadUrlDto(uploadUrl.ToString(), blobPath, expiresAt));
    }

    // Para ver un comprobante ya subido (PaymentShow): el contenedor no
    // tiene lectura pública, así que sin esto no habría forma de mostrar
    // la imagen/PDF. Mismo bloqueo por fila que GetOne -- un residente
    // puro solo puede pedir la URL de un pago de su propia unidad, y
    // 404 (no 403) tanto si el pago no es suyo como si todavía no tiene
    // comprobante cargado.
    [Function("GetPaymentReceiptViewUrl")]
    public async Task<IActionResult> GetReceiptViewUrl(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "payments/{id:int}/receipt-view-url")] HttpRequest req, int id)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT {SelectColumns}
            FROM dbo.Payments p
            LEFT JOIN dbo.Residents r ON r.ResidentId = p.ReviewedByUserId
            WHERE p.PaymentId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        var payment = Read(reader);

        var currentUser = req.HttpContext.GetCurrentUser();
        var isPureResident = currentUser is not null && currentUser.Residente && !currentUser.Administrador && !currentUser.SuperAdministrador;
        if (isPureResident && payment.UnitId != currentUser!.UnitId)
        {
            return new NotFoundResult();
        }

        var scope = ResolveNeighborhoodScope(req);
        if (scope.IsScoped)
        {
            var unitNeighborhoodId = await FindUnitNeighborhoodIdAsync(connection, payment.UnitId);
            if (unitNeighborhoodId is null || unitNeighborhoodId != scope.NeighborhoodId)
            {
                return new NotFoundResult();
            }
        }

        var view = BlobStorageService.GetViewUrl(payment.ReceiptBlobPath);
        if (view is null)
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(new ReceiptViewUrlDto(view.Value.ViewUrl.ToString(), view.Value.ExpiresAt));
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

        // Un residente puro no puede modificar un pago ya cargado, ni
        // siquiera el suyo propio: no cambia su estado, su unidad, su
        // comprobante ni nada -- revisar/editar un pago es trabajo del
        // administrador. El frontend le oculta el botón "Editar" en
        // PaymentShow (ver isPureResident en RequireRole.tsx), pero esto
        // es lo que realmente lo bloquea si alguien llama al API directo.
        var currentUser = req.HttpContext.GetCurrentUser();
        var isPureResident = currentUser is not null && currentUser.Residente && !currentUser.Administrador && !currentUser.SuperAdministrador;
        if (isPureResident)
        {
            return new ObjectResult(new
            {
                error = "No podés modificar un pago ya cargado.",
                message = "No podés modificar un pago ya cargado.",
            })
            { StatusCode = StatusCodes.Status403Forbidden };
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

        // Un Administrador no puede editar un pago que no sea de su
        // colonia (404, ni confirma que existe) ni moverlo a una unidad
        // de otra colonia (400) -- mismo criterio que GetOne/Create.
        var scope = ResolveNeighborhoodScope(req);
        if (scope.IsScoped)
        {
            var currentUnitNeighborhoodId = await FindUnitNeighborhoodIdAsync(connection, int.Parse(currentUnitIdRaw));
            if (currentUnitNeighborhoodId is null || currentUnitNeighborhoodId != scope.NeighborhoodId)
            {
                return new NotFoundResult();
            }
            if (body?.UnitId is not null)
            {
                var newUnitNeighborhoodId = await FindUnitNeighborhoodIdAsync(connection, body.UnitId.Value);
                if (newUnitNeighborhoodId is null || newUnitNeighborhoodId != scope.NeighborhoodId)
                {
                    return new BadRequestObjectResult(new { error = "Esa unidad no pertenece a tu colonia.", message = "Esa unidad no pertenece a tu colonia." });
                }
            }
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

        PaymentDto updated;
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            if (!await reader.ReadAsync())
            {
                return new NotFoundResult();
            }
            updated = Read(reader);
        }

        // Mismo motivo que en CreatePayment: el OUTPUT INSERTED de la
        // UPDATE no puede hacer JOIN, así que ReviewedByName viene null
        // acá todavía. ReviewedByUserId puede ser el de esta misma
        // llamada (isNewReview) o uno de una revisión anterior que este
        // Update no tocó -- de cualquier forma, resolver el nombre
        // siempre a partir del ReviewedByUserId final es correcto en los
        // dos casos.
        if (updated.ReviewedByUserId is not null)
        {
            var reviewerName = await GetResidentNameAsync(connection, updated.ReviewedByUserId);
            updated = updated with { ReviewedByName = reviewerName };
        }

        // Aviso por correo de que un pago quedó aprobado/rechazado --
        // solo cuando esta llamada es una revisión nueva de verdad
        // (isNewReview, calculado arriba), nunca en una edición que no
        // toca Status. Un correo que falla no debe tumbar la
        // actualización del pago, que ya quedó guardada: se loguea y se
        // sigue (ver SendPaymentReviewEmailAsync).
        if (isNewReview)
        {
            await SendPaymentReviewEmailAsync(connection, updated);
        }

        return new OkObjectResult(updated);
    }

    // Nombres de mes en español, a mano: evita depender de que el
    // runtime de Azure Functions tenga cargados los datos de
    // globalización de una cultura específica (CultureInfo("es-...")
    // puede no estar disponible según cómo esté empaquetado el host).
    private static readonly string[] SpanishMonths =
    {
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    };

    private static string FormatPeriod(DateTime period) => $"{SpanishMonths[period.Month - 1]} de {period.Year}";

    // Le avisa al residente del pago que su comprobante fue revisado.
    // Busca su nombre/correo en dbo.Residents (Payments no los guarda
    // directo) y la moneda de su unidad (Units -> Neighborhoods, mismo
    // salto que ya hace el resto del proyecto para resolver moneda) --
    // ambas son consultas puntuales sobre un solo pago, no una lista, así
    // que no vale el mismo reparo de costo que tiene resolver moneda por
    // fila en PaymentList. Si el residente no tiene correo cargado, no
    // hay a quién avisarle: se corta ahí, no es un error.
    private async Task SendPaymentReviewEmailAsync(Microsoft.Data.SqlClient.SqlConnection connection, PaymentDto payment)
    {
        if (payment.ResidentId is null)
        {
            _logger.LogInformation(
                "Correo de revisión del pago {PaymentId} omitido: el pago no tiene ResidentId asociado.", payment.Id);
            return;
        }

        try
        {
            string? residentName = null;
            string? residentEmail = null;
            var receiveEmails = true;

            await using (var cmd = connection.CreateCommand())
            {
                cmd.CommandText = "SELECT Name, Email, ReceiveEmails FROM dbo.Residents WHERE ResidentId = @residentId";
                cmd.Parameters.AddWithValue("@residentId", payment.ResidentId.Value);
                await using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    residentName = reader.GetString(reader.GetOrdinal("Name"));
                    receiveEmails = reader.GetBoolean(reader.GetOrdinal("ReceiveEmails"));
                    if (!reader.IsDBNull(reader.GetOrdinal("Email")))
                    {
                        residentEmail = reader.GetString(reader.GetOrdinal("Email"));
                    }
                }
            }

            if (!receiveEmails)
            {
                _logger.LogInformation(
                    "Correo de revisión del pago {PaymentId} omitido: el residente {ResidentId} eligió no recibir correos.",
                    payment.Id, payment.ResidentId);
                return;
            }

            if (string.IsNullOrWhiteSpace(residentEmail))
            {
                _logger.LogInformation(
                    "Correo de revisión del pago {PaymentId} omitido: el residente {ResidentId} no tiene Email cargado.",
                    payment.Id, payment.ResidentId);
                return;
            }

            _logger.LogInformation(
                "Enviando correo de revisión del pago {PaymentId} a {Email}...", payment.Id, residentEmail);

            string? currency = null;
            string? unitIdentifier = null;
            string? neighborhoodName = null;
            await using (var cmd = connection.CreateCommand())
            {
                cmd.CommandText = @"
                    SELECT N.Currency, U.Identifier, N.Name AS NeighborhoodName
                    FROM dbo.Units U
                    JOIN dbo.Neighborhoods N ON N.NeighborhoodId = U.NeighborhoodId
                    WHERE U.UnitId = @unitId";
                cmd.Parameters.AddWithValue("@unitId", payment.UnitId);
                await using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    currency = reader.IsDBNull(reader.GetOrdinal("Currency")) ? null : reader.GetString(reader.GetOrdinal("Currency"));
                    unitIdentifier = reader.GetString(reader.GetOrdinal("Identifier"));
                    neighborhoodName = reader.GetString(reader.GetOrdinal("NeighborhoodName"));
                }
            }

            var period = FormatPeriod(payment.Period);
            var isApproved = payment.Status == "approved";
            var amountText = currency is null ? payment.Amount.ToString("F2") : $"{payment.Amount:F2} {currency}";

            var subject = isApproved
                ? $"Tu pago de {period} fue aprobado"
                : $"Tu pago de {period} fue rechazado";
            var htmlContent = isApproved
                ? PaymentEmailTemplates.PaymentApproved(
                    residentName!, unitIdentifier ?? "tu unidad", neighborhoodName ?? "la colonia", period, amountText)
                : PaymentEmailTemplates.PaymentRejected(
                    residentName!, unitIdentifier ?? "tu unidad", neighborhoodName ?? "la colonia", period, payment.RejectionReason);

            var sendResult = await EmailService.SendAsync(residentEmail, residentName, subject, htmlContent);
            if (!sendResult.Success)
            {
                _logger.LogWarning(
                    "No se pudo enviar el correo de revisión del pago {PaymentId}: {StatusCode} {Body}",
                    payment.Id, sendResult.StatusCode, sendResult.ResponseBody);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al enviar el correo de revisión del pago {PaymentId}", payment.Id);
        }
    }

    [Function("DeletePayment")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "payments/{id:int}")] HttpRequest req, int id)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        var scope = ResolveNeighborhoodScope(req);
        if (scope.IsScoped)
        {
            object? currentUnitIdRaw;
            await using (var currentCmd = connection.CreateCommand())
            {
                currentCmd.CommandText = "SELECT UnitId FROM dbo.Payments WHERE PaymentId = @id";
                currentCmd.Parameters.AddWithValue("@id", id);
                currentUnitIdRaw = await currentCmd.ExecuteScalarAsync();
            }
            if (currentUnitIdRaw is null)
            {
                return new NotFoundResult();
            }
            var unitNeighborhoodId = await FindUnitNeighborhoodIdAsync(connection, (int)currentUnitIdRaw);
            if (unitNeighborhoodId is null || unitNeighborhoodId != scope.NeighborhoodId)
            {
                return new NotFoundResult();
            }
        }

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
