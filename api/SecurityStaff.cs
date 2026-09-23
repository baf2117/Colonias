using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Neighborhood.Auth;
using Neighborhood.Database;

namespace Neighborhood;

// CRUD de guardias (dbo.SecurityStaff), calcado del patrón de Vendors.cs.
// Un guardia no es un Resident: no pertenece a una unidad, pertenece
// directo a una colonia (NeighborhoodId NOT NULL). Auth0Sub sigue la
// misma regla que en Residents.cs: nunca viaja en Create/Update, solo
// se puede setear a través de RegisterSecurityStaff (más abajo), que lo
// toma del JWT validado.
public class SecurityStaff
{
    private readonly ILogger<SecurityStaff> _logger;

    public SecurityStaff(ILogger<SecurityStaff> logger)
    {
        _logger = logger;
    }

    public record SecurityStaffDto(int Id, string Name, string? Phone, bool Active, int NeighborhoodId, string? Auth0Sub, decimal Salary, decimal Bonuses, DateTime? HireDate);

    private const string SelectColumns = "StaffId, Name, Phone, Active, NeighborhoodId, Auth0Sub, Salary, Bonuses, HireDate";

    private static SecurityStaffDto Read(Microsoft.Data.SqlClient.SqlDataReader reader) => new(
        reader.GetInt32(reader.GetOrdinal("StaffId")),
        reader.GetString(reader.GetOrdinal("Name")),
        reader.IsDBNull(reader.GetOrdinal("Phone")) ? null : reader.GetString(reader.GetOrdinal("Phone")),
        reader.GetBoolean(reader.GetOrdinal("Active")),
        reader.GetInt32(reader.GetOrdinal("NeighborhoodId")),
        reader.IsDBNull(reader.GetOrdinal("Auth0Sub")) ? null : reader.GetString(reader.GetOrdinal("Auth0Sub")),
        reader.GetDecimal(reader.GetOrdinal("Salary")),
        reader.GetDecimal(reader.GetOrdinal("Bonuses")),
        reader.IsDBNull(reader.GetOrdinal("HireDate")) ? null : reader.GetDateTime(reader.GetOrdinal("HireDate")));

    // Guardias, tercer recurso del grupo Administración: mismo bloqueo total
    // que Units.cs y Expenses.cs. RegisterSecurityStaff (el auto-registro,
    // más abajo) queda deliberadamente afuera: lo usa cualquier guardia que
    // todavía no tiene fila en SecurityStaff.
    private static IActionResult? RequireAdminOrSuperAdmin(HttpRequest req)
    {
        var currentUser = req.HttpContext.GetCurrentUser();
        if (currentUser is null || !(currentUser.Administrador || currentUser.SuperAdministrador))
        {
            return new ObjectResult(new
            {
                error = "Solo un administrador puede acceder a los guardias.",
                message = "Solo un administrador puede acceder a los guardias.",
            })
            { StatusCode = StatusCodes.Status403Forbidden };
        }
        return null;
    }

    [Function("GetSecurityStaff")]
    public async Task<IActionResult> GetList(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "security-staff")] HttpRequest req)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        int start = 0, end = 24;
        if (req.Query.TryGetValue("range", out var rangeRaw))
        {
            var range = JsonSerializer.Deserialize<int[]>(rangeRaw.ToString());
            if (range is { Length: 2 })
            {
                start = range[0];
                end = range[1];
            }
        }

        var sortField = "StaffId";
        var sortDir = "ASC";
        if (req.Query.TryGetValue("sort", out var sortRaw))
        {
            var sort = JsonSerializer.Deserialize<string[]>(sortRaw.ToString());
            if (sort is { Length: 2 })
            {
                sortField = sort[0] switch
                {
                    "id" => "StaffId",
                    "name" => "Name",
                    "phone" => "Phone",
                    "active" => "Active",
                    "neighborhoodId" => "NeighborhoodId",
                    "salary" => "Salary",
                    "bonuses" => "Bonuses",
                    _ => "StaffId",
                };
                sortDir = sort[1].Equals("DESC", StringComparison.OrdinalIgnoreCase) ? "DESC" : "ASC";
            }
        }

        // filter.q: texto libre (busca por Name). filter.neighborhoodId:
        // lo que usa NeighborhoodShow para listar los guardias de una
        // colonia puntual (ReferenceManyField).
        string? nameFilter = null;
        int? neighborhoodIdFilter = null;
        if (req.Query.TryGetValue("filter", out var filterRaw))
        {
            try
            {
                using var filterDoc = JsonDocument.Parse(filterRaw.ToString());
                if (filterDoc.RootElement.TryGetProperty("q", out var qEl) && qEl.ValueKind == JsonValueKind.String)
                {
                    nameFilter = qEl.GetString();
                }
                if (filterDoc.RootElement.TryGetProperty("neighborhoodId", out var nEl) && nEl.TryGetInt32(out var nId))
                {
                    neighborhoodIdFilter = nId;
                }
            }
            catch (JsonException)
            {
                // filter mal formado: se ignora en vez de romper la lista.
            }
        }

        var whereClauses = new List<string>();
        if (!string.IsNullOrWhiteSpace(nameFilter))
        {
            whereClauses.Add("Name LIKE @nameFilter");
        }
        if (neighborhoodIdFilter is not null)
        {
            whereClauses.Add("NeighborhoodId = @neighborhoodId");
        }
        var whereSql = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        int total;
        await using (var countCmd = connection.CreateCommand())
        {
            countCmd.CommandText = $"SELECT COUNT(*) FROM dbo.SecurityStaff {whereSql}";
            if (!string.IsNullOrWhiteSpace(nameFilter))
            {
                countCmd.Parameters.AddWithValue("@nameFilter", $"%{nameFilter}%");
            }
            if (neighborhoodIdFilter is not null)
            {
                countCmd.Parameters.AddWithValue("@neighborhoodId", neighborhoodIdFilter.Value);
            }
            total = (int)(await countCmd.ExecuteScalarAsync() ?? 0);
        }

        var staff = new List<SecurityStaffDto>();
        await using (var cmd = connection.CreateCommand())
        {
            // sortField sale de un allow-list fijo de arriba, así que esta
            // interpolación es segura (nunca viene directo del usuario).
            cmd.CommandText = $@"
                SELECT {SelectColumns}
                FROM dbo.SecurityStaff
                {whereSql}
                ORDER BY {sortField} {sortDir}
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
            if (!string.IsNullOrWhiteSpace(nameFilter))
            {
                cmd.Parameters.AddWithValue("@nameFilter", $"%{nameFilter}%");
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
                staff.Add(Read(reader));
            }
        }

        req.HttpContext.Response.Headers["Content-Range"] =
            $"security-staff {start}-{Math.Min(end, Math.Max(total - 1, 0))}/{total}";
        req.HttpContext.Response.Headers["Access-Control-Expose-Headers"] = "Content-Range";

        return new OkObjectResult(staff);
    }

    [Function("GetSecurityStaffMember")]
    public async Task<IActionResult> GetOne(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "security-staff/{id:int}")] HttpRequest req, int id)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = $"SELECT {SelectColumns} FROM dbo.SecurityStaff WHERE StaffId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    // HireDate: fecha de contratación, prorratea el Bono 14 y el aguinaldo
    // (ver AccountStatement.cs). Opcional en el API porque el auto-registro
    // no la tiene; el formulario del dashboard la pide siempre.
    private static DateTime TodayLocal() => DateTime.UtcNow.AddHours(-6).Date;

    private static string? ValidateHireDate(DateTime? hireDate) =>
        hireDate is not null && hireDate.Value.Date > TodayLocal() ? "La fecha de contratación no puede ser futura." : null;

    public record CreateSecurityStaffBody(string Name, string? Phone, bool? Active, int NeighborhoodId, decimal? Salary, decimal? Bonuses, DateTime? HireDate);

    [Function("CreateSecurityStaffMember")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "security-staff")] HttpRequest req)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        var body = await JsonSerializer.DeserializeAsync<CreateSecurityStaffBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body is null || string.IsNullOrWhiteSpace(body.Name))
        {
            return new BadRequestObjectResult(new { error = "Name is required." });
        }

        if (body.NeighborhoodId <= 0)
        {
            return new BadRequestObjectResult(new { error = "NeighborhoodId is required." });
        }

        if (ValidateHireDate(body.HireDate) is { } hireDateError)
        {
            return new BadRequestObjectResult(new { error = hireDateError, message = hireDateError });
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO dbo.SecurityStaff (Name, Phone, Active, NeighborhoodId, Salary, Bonuses, HireDate)
            OUTPUT INSERTED.StaffId, INSERTED.Name, INSERTED.Phone, INSERTED.Active, INSERTED.NeighborhoodId, INSERTED.Auth0Sub, INSERTED.Salary, INSERTED.Bonuses, INSERTED.HireDate
            VALUES (@name, @phone, @active, @neighborhoodId, @salary, @bonuses, @hireDate)";
        cmd.Parameters.AddWithValue("@name", body.Name);
        cmd.Parameters.AddWithValue("@phone", (object?)body.Phone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@active", body.Active ?? true);
        cmd.Parameters.AddWithValue("@neighborhoodId", body.NeighborhoodId);
        cmd.Parameters.AddWithValue("@salary", body.Salary ?? 0);
        cmd.Parameters.AddWithValue("@bonuses", body.Bonuses ?? 0);
        cmd.Parameters.AddWithValue("@hireDate", body.HireDate is not null ? body.HireDate.Value.Date : (object)DBNull.Value);

        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        var created = Read(reader);

        return new CreatedResult($"/api/security-staff/{created.Id}", created);
    }

    public record UpdateSecurityStaffBody(string? Name, string? Phone, bool? Active, int? NeighborhoodId, decimal? Salary, decimal? Bonuses, DateTime? HireDate);

    [Function("UpdateSecurityStaffMember")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "security-staff/{id:int}")] HttpRequest req, int id)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        var body = await JsonSerializer.DeserializeAsync<UpdateSecurityStaffBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (ValidateHireDate(body?.HireDate) is { } hireDateError)
        {
            return new BadRequestObjectResult(new { error = hireDateError, message = hireDateError });
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            UPDATE dbo.SecurityStaff
            SET Name = COALESCE(@name, Name),
                Phone = @phone,
                Active = COALESCE(@active, Active),
                NeighborhoodId = COALESCE(@neighborhoodId, NeighborhoodId),
                Salary = COALESCE(@salary, Salary),
                Bonuses = COALESCE(@bonuses, Bonuses),
                HireDate = COALESCE(@hireDate, HireDate)
            OUTPUT INSERTED.StaffId, INSERTED.Name, INSERTED.Phone, INSERTED.Active, INSERTED.NeighborhoodId, INSERTED.Auth0Sub, INSERTED.Salary, INSERTED.Bonuses, INSERTED.HireDate
            WHERE StaffId = @id";
        cmd.Parameters.AddWithValue("@name", (object?)body?.Name ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@phone", (object?)body?.Phone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@active", (object?)body?.Active ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@neighborhoodId", (object?)body?.NeighborhoodId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@salary", (object?)body?.Salary ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@bonuses", (object?)body?.Bonuses ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@hireDate", body?.HireDate is not null ? body.HireDate.Value.Date : (object)DBNull.Value);
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    [Function("DeleteSecurityStaffMember")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "security-staff/{id:int}")] HttpRequest req, int id)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM dbo.SecurityStaff OUTPUT DELETED.StaffId WHERE StaffId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        try
        {
            var deletedId = await cmd.ExecuteScalarAsync();
            if (deletedId is null)
            {
                return new NotFoundResult();
            }

            return new OkObjectResult(new { id = (int)deletedId });
        }
        catch (Microsoft.Data.SqlClient.SqlException ex) when (ex.Number is 547)
        {
            // FK violation: este guardia todavía tiene registros de acceso
            // que lo referencian (AccessLog.GuardUserId). Desactivar (Active
            // = false) es la salida normal en vez de eliminar.
            _logger.LogWarning(ex, "DeleteSecurityStaffMember {Id} blocked by a foreign key.", id);
            return new ConflictObjectResult(new { error = "No se puede eliminar: este guardia tiene registros relacionados (accesos). Desactívalo en vez de eliminarlo." });
        }
    }

    public record RegisterSecurityStaffBody(string Code, string Name, string? Phone);

    // Auto-registro: mismo mecanismo que RegisterResident (ver
    // Residents.cs), pero con el código de la colonia
    // (Neighborhoods.StaffRegistrationCode) en vez del de una unidad,
    // porque un guardia no pertenece a una unidad.
    [Function("RegisterSecurityStaff")]
    public async Task<IActionResult> Register(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "security-staff/register")] HttpRequest req)
    {
        var sub = req.HttpContext.GetAuth0Sub();
        if (string.IsNullOrEmpty(sub))
        {
            // No debería pasar: si llegamos hasta acá, el middleware ya
            // validó el JWT y guardó el sub.
            return new UnauthorizedResult();
        }

        var body = await JsonSerializer.DeserializeAsync<RegisterSecurityStaffBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body is null || string.IsNullOrWhiteSpace(body.Code))
        {
            return new BadRequestObjectResult(new { error = "El código de la colonia es obligatorio." });
        }
        if (string.IsNullOrWhiteSpace(body.Name))
        {
            return new BadRequestObjectResult(new { error = "El nombre es obligatorio." });
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        int neighborhoodId;
        await using (var lookupCmd = connection.CreateCommand())
        {
            lookupCmd.CommandText = "SELECT NeighborhoodId FROM dbo.Neighborhoods WHERE StaffRegistrationCode = @code";
            lookupCmd.Parameters.AddWithValue("@code", body.Code.Trim());
            var result = await lookupCmd.ExecuteScalarAsync();
            if (result is null)
            {
                return new BadRequestObjectResult(new { error = "Código inválido. Verifica con el administrador de la colonia." });
            }
            neighborhoodId = (int)result;
        }

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO dbo.SecurityStaff (Name, Phone, NeighborhoodId, Auth0Sub, Active)
            OUTPUT
                INSERTED.StaffId, INSERTED.Name, INSERTED.Phone, INSERTED.Active,
                INSERTED.NeighborhoodId, INSERTED.Auth0Sub, INSERTED.Salary, INSERTED.Bonuses, INSERTED.HireDate
            VALUES (@name, @phone, @neighborhoodId, @sub, 1)";
        cmd.Parameters.AddWithValue("@name", body.Name.Trim());
        cmd.Parameters.AddWithValue("@phone", (object?)body.Phone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@neighborhoodId", neighborhoodId);
        cmd.Parameters.AddWithValue("@sub", sub);

        try
        {
            await using var reader = await cmd.ExecuteReaderAsync();
            await reader.ReadAsync();
            var created = Read(reader);
            return new CreatedResult($"/api/security-staff/{created.Id}", created);
        }
        catch (Microsoft.Data.SqlClient.SqlException ex) when (ex.Number is 2601 or 2627)
        {
            // UX_SecurityStaff_Auth0Sub: esta cuenta de Auth0 ya tiene una
            // fila en SecurityStaff (probablemente desactivada). No puede
            // auto-registrarse de nuevo; que lo resuelva el administrador.
            _logger.LogWarning(ex, "RegisterSecurityStaff blocked: Auth0Sub {Sub} already has a SecurityStaff row.", sub);
            return new ConflictObjectResult(new { error = "Ya existe una cuenta registrada con este inicio de sesión. Contacta al administrador." });
        }
    }
}
