using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Neighborhood.Auth;
using Neighborhood.Database;
using Neighborhood.Storage;

namespace Neighborhood;

// Estados de cuenta bancarios (dbo.BankStatements): el administrador sube
// el archivo del banco de un mes y anota el saldo final, para cuadrarlo
// contra lo que dice el sistema. Todo el recurso es solo para
// Administrador/SuperAdministrador. Un Administrador queda acotado a su
// colonia (currentUser.NeighborhoodId) en lectura y escritura, mismo
// criterio que Units.cs/Vendors.cs; un SuperAdministrador elige la
// colonia al subir. Borrar es solo de SuperAdministrador, igual que
// pagos, gastos y nómina.
//
// El archivo es obligatorio y sigue el mismo flujo de dos pasos que los
// comprobantes de Expenses: primero GetBankStatementUploadUrl, el
// navegador sube directo a Blob Storage, y recién ahí CreateBankStatement
// con la ruta ya subida.
public class BankStatements
{
    private readonly ILogger<BankStatements> _logger;

    public BankStatements(ILogger<BankStatements> logger)
    {
        _logger = logger;
    }

    public record BankStatementDto(
        int Id,
        int NeighborhoodId,
        DateTime Period,
        decimal BankBalance,
        string? StatementBlobPath,
        string? Notes,
        int UploadedByUserId,
        DateTime CreatedAt);

    private const string SelectColumns =
        "BankStatementId, NeighborhoodId, Period, BankBalance, StatementBlobPath, Notes, UploadedByUserId, CreatedAt";

    private static BankStatementDto Read(Microsoft.Data.SqlClient.SqlDataReader reader) => new(
        reader.GetInt32(reader.GetOrdinal("BankStatementId")),
        reader.GetInt32(reader.GetOrdinal("NeighborhoodId")),
        reader.GetDateTime(reader.GetOrdinal("Period")),
        reader.GetDecimal(reader.GetOrdinal("BankBalance")),
        reader.IsDBNull(reader.GetOrdinal("StatementBlobPath")) ? null : reader.GetString(reader.GetOrdinal("StatementBlobPath")),
        reader.IsDBNull(reader.GetOrdinal("Notes")) ? null : reader.GetString(reader.GetOrdinal("Notes")),
        reader.GetInt32(reader.GetOrdinal("UploadedByUserId")),
        reader.GetDateTime(reader.GetOrdinal("CreatedAt")));

    private static DateTime FirstOfMonth(DateTime date) => new(date.Year, date.Month, 1);

    private static IActionResult Forbidden(string message) =>
        new ObjectResult(new { error = message, message }) { StatusCode = StatusCodes.Status403Forbidden };

    private static IActionResult BadRequest(string message) =>
        new BadRequestObjectResult(new { error = message, message });

    private static IActionResult? RequireAdminOrSuperAdmin(HttpRequest req)
    {
        var currentUser = req.HttpContext.GetCurrentUser();
        if (currentUser is null || !(currentUser.Administrador || currentUser.SuperAdministrador))
        {
            return Forbidden("Solo un administrador puede acceder a los estados de cuenta.");
        }
        return null;
    }

    private static IActionResult? RequireSuperAdministrador(HttpRequest req)
    {
        var currentUser = req.HttpContext.GetCurrentUser();
        if (currentUser is null || !currentUser.SuperAdministrador)
        {
            return Forbidden("Solo un superadministrador puede eliminar un estado de cuenta.");
        }
        return null;
    }

    // Mismo criterio y forma que ResolveNeighborhoodScope en Units.cs/
    // Vendors.cs/Payments.cs (duplicado a propósito, cada recurso es
    // autocontenido).
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

    private const string NoNeighborhoodMessage =
        "No tenés una colonia asignada. Pedile a un superadministrador que te asigne una.";

    // La colonia en la que se va a subir/crear: la del Administrador
    // (forzada, ignora el body) o la que eligió el SuperAdministrador.
    private static (int? NeighborhoodId, IActionResult? Error) ResolveTargetNeighborhood(HttpRequest req, int requestedNeighborhoodId)
    {
        var scope = ResolveNeighborhoodScope(req);
        if (scope.IsScoped)
        {
            return scope.NeighborhoodId is null
                ? (null, BadRequest(NoNeighborhoodMessage))
                : (scope.NeighborhoodId, null);
        }
        return requestedNeighborhoodId <= 0
            ? (null, BadRequest("La colonia es obligatoria."))
            : (requestedNeighborhoodId, null);
    }

    private static async Task<bool> NeighborhoodExistsAsync(Microsoft.Data.SqlClient.SqlConnection connection, int neighborhoodId)
    {
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT 1 FROM dbo.Neighborhoods WHERE NeighborhoodId = @id";
        cmd.Parameters.AddWithValue("@id", neighborhoodId);
        return await cmd.ExecuteScalarAsync() is not null;
    }

    // Trae un estado de cuenta respetando el scope: null si no existe o si
    // es de otra colonia para un Administrador (404 en los dos casos, para
    // no confirmar que el id existe).
    private static async Task<BankStatementDto?> FindInScopeAsync(
        Microsoft.Data.SqlClient.SqlConnection connection, NeighborhoodScope scope, int id)
    {
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = $"SELECT {SelectColumns} FROM dbo.BankStatements WHERE BankStatementId = @id"
            + (scope.IsScoped ? " AND NeighborhoodId = @scopeNeighborhoodId" : "");
        cmd.Parameters.AddWithValue("@id", id);
        if (scope.IsScoped)
        {
            cmd.Parameters.AddWithValue("@scopeNeighborhoodId", (object?)scope.NeighborhoodId ?? DBNull.Value);
        }
        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? Read(reader) : null;
    }

    [Function("GetBankStatements")]
    public async Task<IActionResult> GetList(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "bank-statements")] HttpRequest req)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

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
                    "id" => "BankStatementId",
                    "neighborhoodId" => "NeighborhoodId",
                    "period" => "Period",
                    "bankBalance" => "BankBalance",
                    "createdAt" => "CreatedAt",
                    _ => "Period",
                };
                sortDir = sort[1].Equals("DESC", StringComparison.OrdinalIgnoreCase) ? "DESC" : "ASC";
            }
        }

        // filter.neighborhoodId (solo cuenta para un SuperAdministrador;
        // a un Administrador se le fuerza la suya), filter.year.
        int? neighborhoodIdFilter = null;
        int? yearFilter = null;
        if (req.Query.TryGetValue("filter", out var filterRaw))
        {
            try
            {
                using var filterDoc = JsonDocument.Parse(filterRaw.ToString());
                if (filterDoc.RootElement.TryGetProperty("neighborhoodId", out var nEl) && nEl.TryGetInt32(out var nId))
                {
                    neighborhoodIdFilter = nId;
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

        var scope = ResolveNeighborhoodScope(req);
        if (scope.IsScoped && scope.NeighborhoodId is null)
        {
            req.HttpContext.Response.Headers["Content-Range"] = "bank-statements 0-0/0";
            req.HttpContext.Response.Headers["Access-Control-Expose-Headers"] = "Content-Range";
            return new OkObjectResult(Array.Empty<BankStatementDto>());
        }
        var effectiveNeighborhoodId = scope.IsScoped ? scope.NeighborhoodId : neighborhoodIdFilter;

        var whereClauses = new List<string>();
        if (effectiveNeighborhoodId is not null)
        {
            whereClauses.Add("NeighborhoodId = @neighborhoodId");
        }
        if (yearFilter is not null)
        {
            whereClauses.Add("YEAR(Period) = @year");
        }
        var whereSql = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        void AddFilterParams(Microsoft.Data.SqlClient.SqlCommand cmd)
        {
            if (effectiveNeighborhoodId is not null) cmd.Parameters.AddWithValue("@neighborhoodId", effectiveNeighborhoodId.Value);
            if (yearFilter is not null) cmd.Parameters.AddWithValue("@year", yearFilter.Value);
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        int total;
        await using (var countCmd = connection.CreateCommand())
        {
            countCmd.CommandText = $"SELECT COUNT(*) FROM dbo.BankStatements {whereSql}";
            AddFilterParams(countCmd);
            total = (int)(await countCmd.ExecuteScalarAsync() ?? 0);
        }

        var statements = new List<BankStatementDto>();
        await using (var cmd = connection.CreateCommand())
        {
            // sortField sale de un allow-list fijo de arriba.
            cmd.CommandText = $@"
                SELECT {SelectColumns}
                FROM dbo.BankStatements
                {whereSql}
                ORDER BY {sortField} {sortDir}, BankStatementId DESC
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
            AddFilterParams(cmd);
            cmd.Parameters.AddWithValue("@offset", start);
            cmd.Parameters.AddWithValue("@limit", Math.Max(end - start + 1, 1));

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                statements.Add(Read(reader));
            }
        }

        req.HttpContext.Response.Headers["Content-Range"] =
            $"bank-statements {start}-{Math.Min(end, Math.Max(total - 1, 0))}/{total}";
        req.HttpContext.Response.Headers["Access-Control-Expose-Headers"] = "Content-Range";

        return new OkObjectResult(statements);
    }

    [Function("GetBankStatement")]
    public async Task<IActionResult> GetOne(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "bank-statements/{id:int}")] HttpRequest req, int id)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        var statement = await FindInScopeAsync(connection, ResolveNeighborhoodScope(req), id);
        return statement is null ? new NotFoundResult() : new OkObjectResult(statement);
    }

    public record UploadUrlBody(int NeighborhoodId, string Extension);
    public record UploadUrlDto(string UploadUrl, string BlobPath, DateTimeOffset ExpiresAt);
    public record ViewUrlDto(string Url, DateTimeOffset ExpiresAt);

    [Function("GetBankStatementUploadUrl")]
    public async Task<IActionResult> GetUploadUrl(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "bank-statements/upload-url")] HttpRequest req)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        var body = await JsonSerializer.DeserializeAsync<UploadUrlBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        if (body is null || string.IsNullOrWhiteSpace(body.Extension))
        {
            return BadRequest("Extension is required.");
        }

        var extension = body.Extension.TrimStart('.').ToLowerInvariant();
        if (!BlobStorageService.AllowedExtensions.Contains(extension))
        {
            return BadRequest("Formato de archivo no permitido.");
        }

        var (neighborhoodId, error) = ResolveTargetNeighborhood(req, body.NeighborhoodId);
        if (error is not null)
        {
            return error;
        }

        var blobPath = BlobStorageService.NewBankStatementBlobPath(neighborhoodId!.Value, extension);
        var (uploadUrl, expiresAt) = BlobStorageService.GetUploadUrl(blobPath);
        return new OkObjectResult(new UploadUrlDto(uploadUrl.ToString(), blobPath, expiresAt));
    }

    [Function("GetBankStatementFileViewUrl")]
    public async Task<IActionResult> GetFileViewUrl(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "bank-statements/{id:int}/file-view-url")] HttpRequest req, int id)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        var statement = await FindInScopeAsync(connection, ResolveNeighborhoodScope(req), id);
        var view = BlobStorageService.GetViewUrl(statement?.StatementBlobPath);
        if (view is null)
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(new ViewUrlDto(view.Value.ViewUrl.ToString(), view.Value.ExpiresAt));
    }

    public record CreateBankStatementBody(int NeighborhoodId, DateTime Period, decimal? BankBalance, string? StatementBlobPath, string? Notes);

    [Function("CreateBankStatement")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "bank-statements")] HttpRequest req)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        var body = await JsonSerializer.DeserializeAsync<CreateBankStatementBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        if (body is null || body.Period == default)
        {
            return BadRequest("El mes es obligatorio.");
        }
        if (body.BankBalance is null)
        {
            return BadRequest("El saldo del banco es obligatorio.");
        }
        if (string.IsNullOrWhiteSpace(body.StatementBlobPath))
        {
            return BadRequest("El archivo del estado de cuenta es obligatorio.");
        }

        var (neighborhoodId, error) = ResolveTargetNeighborhood(req, body.NeighborhoodId);
        if (error is not null)
        {
            return error;
        }

        // El archivo tiene que haberse subido a la carpeta de ESTA colonia
        // (ver GetBankStatementUploadUrl) -- evita asociar un archivo de
        // otra colonia armando el body a mano.
        if (!body.StatementBlobPath.StartsWith(BlobStorageService.BankStatementBlobPrefix(neighborhoodId!.Value), StringComparison.Ordinal))
        {
            return BadRequest("El archivo no corresponde a esta colonia. Subilo de nuevo.");
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        if (!await NeighborhoodExistsAsync(connection, neighborhoodId.Value))
        {
            return BadRequest("Colonia inválida.");
        }

        var currentUser = req.HttpContext.GetCurrentUser()!;

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            INSERT INTO dbo.BankStatements (NeighborhoodId, Period, BankBalance, StatementBlobPath, Notes, UploadedByUserId)
            OUTPUT {string.Join(", ", SelectColumns.Split(", ").Select(c => "INSERTED." + c))}
            VALUES (@neighborhoodId, @period, @bankBalance, @statementBlobPath, @notes, @uploadedByUserId)";
        cmd.Parameters.AddWithValue("@neighborhoodId", neighborhoodId.Value);
        cmd.Parameters.AddWithValue("@period", FirstOfMonth(body.Period));
        cmd.Parameters.AddWithValue("@bankBalance", body.BankBalance.Value);
        cmd.Parameters.AddWithValue("@statementBlobPath", body.StatementBlobPath);
        cmd.Parameters.AddWithValue("@notes", string.IsNullOrWhiteSpace(body.Notes) ? DBNull.Value : (object)body.Notes);
        cmd.Parameters.AddWithValue("@uploadedByUserId", currentUser.ResidentId);

        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        var created = Read(reader);

        return new CreatedResult($"/api/bank-statements/{created.Id}", created);
    }

    // La colonia no se cambia al editar (el archivo vive en la carpeta de
    // esa colonia). StatementBlobPath va con COALESCE: reemplazarlo es
    // subir uno nuevo, nunca vaciarlo. Notes se asigna directo para poder
    // borrarla.
    public record UpdateBankStatementBody(DateTime? Period, decimal? BankBalance, string? StatementBlobPath, string? Notes);

    [Function("UpdateBankStatement")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "bank-statements/{id:int}")] HttpRequest req, int id)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        var body = await JsonSerializer.DeserializeAsync<UpdateBankStatementBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        var current = await FindInScopeAsync(connection, ResolveNeighborhoodScope(req), id);
        if (current is null)
        {
            return new NotFoundResult();
        }

        var newBlobPath = string.IsNullOrWhiteSpace(body?.StatementBlobPath) ? null : body.StatementBlobPath;
        if (newBlobPath is not null
            && !newBlobPath.StartsWith(BlobStorageService.BankStatementBlobPrefix(current.NeighborhoodId), StringComparison.Ordinal))
        {
            return BadRequest("El archivo no corresponde a esta colonia. Subilo de nuevo.");
        }

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            UPDATE dbo.BankStatements
            SET Period = COALESCE(@period, Period),
                BankBalance = COALESCE(@bankBalance, BankBalance),
                StatementBlobPath = COALESCE(@statementBlobPath, StatementBlobPath),
                Notes = @notes
            OUTPUT {string.Join(", ", SelectColumns.Split(", ").Select(c => "INSERTED." + c))}
            WHERE BankStatementId = @id";
        cmd.Parameters.AddWithValue("@period", body?.Period is not null ? FirstOfMonth(body.Period.Value) : (object)DBNull.Value);
        cmd.Parameters.AddWithValue("@bankBalance", (object?)body?.BankBalance ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@statementBlobPath", (object?)newBlobPath ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@notes", string.IsNullOrWhiteSpace(body?.Notes) ? DBNull.Value : (object)body.Notes);
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    [Function("DeleteBankStatement")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "bank-statements/{id:int}")] HttpRequest req, int id)
    {
        var forbidden = RequireSuperAdministrador(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM dbo.BankStatements OUTPUT DELETED.BankStatementId WHERE BankStatementId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        var deletedId = await cmd.ExecuteScalarAsync();
        return deletedId is null ? new NotFoundResult() : new OkObjectResult(new { id = (int)deletedId });
    }
}
