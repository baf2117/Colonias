using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Neighborhood.Auth;
using Neighborhood.Database;
using Neighborhood.Storage;

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
// ReceiptBlobPath (comprobante en Blob Storage) -- a diferencia de
// Payments, acá es OBLIGATORIO (a pedido del usuario): CreateExpense
// rechaza con 400 si no viene. Mismo flujo de dos pasos que Payments
// (GetExpenseReceiptUploadUrl/BlobStorageService.cs primero, el archivo
// nunca pasa por el Function) y misma columna que ya existía en
// schema.sql sin usar todavía.
public class Expenses
{
    private readonly ILogger<Expenses> _logger;

    public Expenses(ILogger<Expenses> logger)
    {
        _logger = logger;
    }

    public record ExpenseDto(int Id, int VendorId, string? Category, decimal Amount, string? Description, string? ReceiptBlobPath, DateTime Date, int RegisteredByUserId);

    private const string SelectColumns = "ExpenseId, VendorId, Category, Amount, Description, ReceiptBlobPath, Date, RegisteredByUserId";

    private static ExpenseDto Read(Microsoft.Data.SqlClient.SqlDataReader reader) => new(
        reader.GetInt32(reader.GetOrdinal("ExpenseId")),
        reader.GetInt32(reader.GetOrdinal("VendorId")),
        reader.IsDBNull(reader.GetOrdinal("Category")) ? null : reader.GetString(reader.GetOrdinal("Category")),
        reader.GetDecimal(reader.GetOrdinal("Amount")),
        reader.IsDBNull(reader.GetOrdinal("Description")) ? null : reader.GetString(reader.GetOrdinal("Description")),
        reader.IsDBNull(reader.GetOrdinal("ReceiptBlobPath")) ? null : reader.GetString(reader.GetOrdinal("ReceiptBlobPath")),
        reader.GetDateTime(reader.GetOrdinal("Date")),
        reader.GetInt32(reader.GetOrdinal("RegisteredByUserId")));

    // Gastos: se probó bloqueando también la lectura (igual que Unidades y
    // Guardias), pero eso rompía el KPI "Gastos del mes" del Panel general
    // para cualquier residente sin rol de administrador — el usuario pidió
    // explícitamente poder ver esa suma sin poder editar ni crear gastos.
    // Por eso GetList/GetOne quedan abiertos a cualquier usuario
    // autenticado (mismo criterio que Neighborhoods.cs: separar lectura de
    // escritura) y solo Create/Update/Delete quedan detrás de
    // RequireAdminOrSuperAdmin. Esto no abre la pantalla de Gastos en sí:
    // ExpenseList/Create/Show/Edit siguen envueltas en
    // requireAdminOrSuperAdmin en App.tsx, así que un residente sigue sin
    // poder navegar a /expenses ni ver el detalle de cada gasto — solo la
    // llamada agregada que hace el dashboard para sumar el total.
    private static IActionResult? RequireAdminOrSuperAdmin(HttpRequest req)
    {
        var currentUser = req.HttpContext.GetCurrentUser();
        if (currentUser is null || !(currentUser.Administrador || currentUser.SuperAdministrador))
        {
            return new ObjectResult(new
            {
                error = "Solo un administrador puede administrar los gastos.",
                message = "Solo un administrador puede administrar los gastos.",
            })
            { StatusCode = StatusCodes.Status403Forbidden };
        }
        return null;
    }

    // Borrar un gasto es irreversible -- el usuario pidió que solo un
    // SuperAdministrador pueda hacerlo, no cualquier Administrador. Mismo
    // criterio en Payments.cs y Payroll.cs para pagos de residentes y
    // pagos a guardias.
    private static IActionResult? RequireSuperAdministrador(HttpRequest req)
    {
        var currentUser = req.HttpContext.GetCurrentUser();
        if (currentUser is null || !currentUser.SuperAdministrador)
        {
            return new ObjectResult(new
            {
                error = "Solo un superadministrador puede eliminar un gasto.",
                message = "Solo un superadministrador puede eliminar un gasto.",
            })
            { StatusCode = StatusCodes.Status403Forbidden };
        }
        return null;
    }

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
        // cualquiera de los dos es independiente del otro). filter.neighborhoodId:
        // el filtro por colonia que pidió el usuario para la vista de
        // SuperAdministrador -- Expenses no tiene columna propia de
        // colonia, se resuelve por EXISTS contra Vendors (ExpenseList.tsx
        // solo le muestra este control a un SuperAdministrador, pero acá
        // no hace falta reforzarlo: es un filtro de lectura más, igual
        // que vendorId/month/year, sobre un GetList que ya está abierto a
        // cualquier autenticado).
        int? vendorIdFilter = null;
        int? monthFilter = null;
        int? yearFilter = null;
        int? neighborhoodIdFilter = null;
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
                if (filterDoc.RootElement.TryGetProperty("neighborhoodId", out var nEl) && nEl.TryGetInt32(out var nVal))
                {
                    neighborhoodIdFilter = nVal;
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
        if (neighborhoodIdFilter is not null)
        {
            whereClauses.Add(@"EXISTS (
                SELECT 1 FROM dbo.Vendors V
                WHERE V.VendorId = dbo.Expenses.VendorId AND V.NeighborhoodId = @neighborhoodId
            )");
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
            if (neighborhoodIdFilter is not null)
            {
                countCmd.Parameters.AddWithValue("@neighborhoodId", neighborhoodIdFilter.Value);
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
            if (neighborhoodIdFilter is not null)
            {
                cmd.Parameters.AddWithValue("@neighborhoodId", neighborhoodIdFilter.Value);
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

    public record CreateExpenseBody(int VendorId, string? Category, decimal Amount, string? Description, string? ReceiptBlobPath, DateTime Date);

    [Function("CreateExpense")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "expenses")] HttpRequest req)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

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

        // Comprobante obligatorio (a pedido del usuario): a diferencia de
        // Payments, acá no hay forma de registrar un gasto sin evidencia.
        if (string.IsNullOrWhiteSpace(body.ReceiptBlobPath))
        {
            return new BadRequestObjectResult(new
            {
                error = "El comprobante es obligatorio.",
                message = "El comprobante es obligatorio.",
            });
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO dbo.Expenses (VendorId, Category, Amount, Description, ReceiptBlobPath, Date, RegisteredByUserId)
            OUTPUT INSERTED.ExpenseId, INSERTED.VendorId, INSERTED.Category, INSERTED.Amount,
                   INSERTED.Description, INSERTED.ReceiptBlobPath, INSERTED.Date, INSERTED.RegisteredByUserId
            VALUES (@vendorId, @category, @amount, @description, @receiptBlobPath, @date, @registeredByUserId)";
        cmd.Parameters.AddWithValue("@vendorId", body.VendorId);
        cmd.Parameters.AddWithValue("@category", (object?)body.Category ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@amount", body.Amount);
        cmd.Parameters.AddWithValue("@description", (object?)body.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@receiptBlobPath", body.ReceiptBlobPath);
        cmd.Parameters.AddWithValue("@date", body.Date == default ? DateTime.UtcNow.Date : body.Date.Date);
        cmd.Parameters.AddWithValue("@registeredByUserId", currentUser.ResidentId);

        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        var created = Read(reader);

        return new CreatedResult($"/api/expenses/{created.Id}", created);
    }

    public record ReceiptUploadUrlBody(int VendorId, string Extension);
    public record ReceiptUploadUrlDto(string UploadUrl, string BlobPath, DateTimeOffset ExpiresAt);
    public record ReceiptViewUrlDto(string Url, DateTimeOffset ExpiresAt);

    // Paso previo a CreateExpense, mismo flujo de dos pasos que
    // GetPaymentReceiptUploadUrl en Payments.cs: quien registra el gasto
    // primero pide esta URL, sube el archivo directo a Blob Storage con
    // ella (nunca pasa por el Function), y recién ahí manda el
    // CreateExpense normal con `receiptBlobPath` ya resuelto -- así
    // nunca queda un gasto "a medias" (creado sin comprobante, algo que
    // acá ni siquiera debería poder pasar porque es obligatorio).
    [Function("GetExpenseReceiptUploadUrl")]
    public async Task<IActionResult> GetReceiptUploadUrl(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "expenses/receipt-upload-url")] HttpRequest req)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        var body = await JsonSerializer.DeserializeAsync<ReceiptUploadUrlBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body is null || body.VendorId <= 0)
        {
            return new BadRequestObjectResult(new { error = "VendorId is required.", message = "VendorId is required." });
        }
        if (string.IsNullOrWhiteSpace(body.Extension))
        {
            return new BadRequestObjectResult(new { error = "Extension is required.", message = "Extension is required." });
        }

        var extension = body.Extension.TrimStart('.').ToLowerInvariant();
        if (!BlobStorageService.AllowedExtensions.Contains(extension))
        {
            return new BadRequestObjectResult(new { error = "Formato de archivo no permitido.", message = "Formato de archivo no permitido." });
        }

        var blobPath = BlobStorageService.NewExpenseBlobPath(body.VendorId, extension);
        var (uploadUrl, expiresAt) = BlobStorageService.GetUploadUrl(blobPath);

        return new OkObjectResult(new ReceiptUploadUrlDto(uploadUrl.ToString(), blobPath, expiresAt));
    }

    // Para ver un comprobante ya subido (ExpenseShow): el contenedor no
    // tiene lectura pública, así que sin esto no habría forma de mostrar
    // la imagen/PDF. Mismo criterio que Create/Update/Delete: solo un
    // administrador puede ver el comprobante de un gasto (a diferencia
    // de Payments, acá no hay un "dueño" residente que pueda ver el suyo
    // -- un gasto es un registro de administración de la colonia, no de
    // una unidad puntual).
    [Function("GetExpenseReceiptViewUrl")]
    public async Task<IActionResult> GetReceiptViewUrl(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "expenses/{id:int}/receipt-view-url")] HttpRequest req, int id)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

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

        var expense = Read(reader);
        var view = BlobStorageService.GetViewUrl(expense.ReceiptBlobPath);
        if (view is null)
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(new ReceiptViewUrlDto(view.Value.ViewUrl.ToString(), view.Value.ExpiresAt));
    }

    // VendorId/Amount/Date siempre vienen del formulario (COALESCE);
    // Category/Description son de texto libre y opcionales, así que se
    // asignan directo — igual que Address en UpdateUnit — para poder
    // vaciarlos desde el formulario de edición. RegisteredByUserId nunca
    // se actualiza: queda fijo a quien registró el gasto originalmente.
    // ReceiptBlobPath va con COALESCE, no asignación directa como
    // Category/Description -- es obligatorio (ver CreateExpense), así
    // que dejarlo en blanco en una edición debe CONSERVAR el que ya
    // había, nunca borrarlo. Reemplazarlo es subir uno nuevo (ver
    // ExpenseReceiptUploadInput.tsx), no vaciar el campo.
    public record UpdateExpenseBody(int? VendorId, string? Category, decimal? Amount, string? Description, string? ReceiptBlobPath, DateTime? Date);

    [Function("UpdateExpense")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "expenses/{id:int}")] HttpRequest req, int id)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

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
                ReceiptBlobPath = COALESCE(@receiptBlobPath, ReceiptBlobPath),
                Date = COALESCE(@date, Date)
            OUTPUT INSERTED.ExpenseId, INSERTED.VendorId, INSERTED.Category, INSERTED.Amount,
                   INSERTED.Description, INSERTED.ReceiptBlobPath, INSERTED.Date, INSERTED.RegisteredByUserId
            WHERE ExpenseId = @id";
        cmd.Parameters.AddWithValue("@vendorId", (object?)body?.VendorId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@category", (object?)body?.Category ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@amount", (object?)body?.Amount ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@description", (object?)body?.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@receiptBlobPath", (object?)body?.ReceiptBlobPath ?? DBNull.Value);
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
        var forbidden = RequireSuperAdministrador(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

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
