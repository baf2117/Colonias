using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Neighborhood.Database;

namespace Neighborhood;

// CRUD de residentes (dbo.Residents), calcado del patrón de Units.cs /
// Vendors.cs. dbo.Residents es la fusión de lo que antes eran dbo.Users
// y dbo.Residents (ver schema.sql): en vez de un Role de texto único,
// cuatro columnas booleanas independientes y combinables
// (Administrador, SuperAdministrador, Residente, Guardia). UnitId y
// RelationType son opcionales — un administrador o guardia "puro" no
// vive en ninguna unidad.
//
// Auth0Sub no se expone en Create/Update a propósito: vincular una
// cuenta de Auth0 a una fila de Residents es un flujo aparte (todavía
// no construido), no algo que el formulario de alta/edición deba poder
// tocar a mano. Sí viaja en el DTO de lectura (GetList/GetOne) para que
// el dashboard pueda mostrar si la cuenta ya está vinculada.
public class Residents
{
    private readonly ILogger<Residents> _logger;

    public Residents(ILogger<Residents> logger)
    {
        _logger = logger;
    }

    public record ResidentDto(
        int Id,
        string Name,
        string? Phone,
        string? Email,
        int? UnitId,
        string? RelationType,
        bool Administrador,
        bool SuperAdministrador,
        bool Residente,
        bool Guardia,
        bool Active,
        string? Auth0Sub);

    private const string SelectColumns =
        "ResidentId, Name, Phone, Email, UnitId, RelationType, Administrador, SuperAdministrador, Residente, Guardia, Active, Auth0Sub";

    private static ResidentDto Read(Microsoft.Data.SqlClient.SqlDataReader reader) => new(
        reader.GetInt32(reader.GetOrdinal("ResidentId")),
        reader.GetString(reader.GetOrdinal("Name")),
        reader.IsDBNull(reader.GetOrdinal("Phone")) ? null : reader.GetString(reader.GetOrdinal("Phone")),
        reader.IsDBNull(reader.GetOrdinal("Email")) ? null : reader.GetString(reader.GetOrdinal("Email")),
        reader.IsDBNull(reader.GetOrdinal("UnitId")) ? null : reader.GetInt32(reader.GetOrdinal("UnitId")),
        reader.IsDBNull(reader.GetOrdinal("RelationType")) ? null : reader.GetString(reader.GetOrdinal("RelationType")),
        reader.GetBoolean(reader.GetOrdinal("Administrador")),
        reader.GetBoolean(reader.GetOrdinal("SuperAdministrador")),
        reader.GetBoolean(reader.GetOrdinal("Residente")),
        reader.GetBoolean(reader.GetOrdinal("Guardia")),
        reader.GetBoolean(reader.GetOrdinal("Active")),
        reader.IsDBNull(reader.GetOrdinal("Auth0Sub")) ? null : reader.GetString(reader.GetOrdinal("Auth0Sub")));

    [Function("GetResidents")]
    public async Task<IActionResult> GetList(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "residents")] HttpRequest req)
    {
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

        var sortField = "ResidentId";
        var sortDir = "ASC";
        if (req.Query.TryGetValue("sort", out var sortRaw))
        {
            var sort = JsonSerializer.Deserialize<string[]>(sortRaw.ToString());
            if (sort is { Length: 2 })
            {
                sortField = sort[0] switch
                {
                    "id" => "ResidentId",
                    "name" => "Name",
                    "phone" => "Phone",
                    "email" => "Email",
                    "unitId" => "UnitId",
                    "relationType" => "RelationType",
                    "administrador" => "Administrador",
                    "superAdministrador" => "SuperAdministrador",
                    "residente" => "Residente",
                    "guardia" => "Guardia",
                    "active" => "Active",
                    _ => "ResidentId",
                };
                sortDir = sort[1].Equals("DESC", StringComparison.OrdinalIgnoreCase) ? "DESC" : "ASC";
            }
        }

        // filter.q: texto libre (busca por Name) — alimenta el
        // autocompletar de residente donde haga falta más adelante.
        // filter.unitId: acota a los residentes de una unidad puntual
        // (p.ej. desde UnitShow).
        string? nameFilter = null;
        int? unitIdFilter = null;
        if (req.Query.TryGetValue("filter", out var filterRaw))
        {
            try
            {
                using var filterDoc = JsonDocument.Parse(filterRaw.ToString());
                if (filterDoc.RootElement.TryGetProperty("q", out var qEl) && qEl.ValueKind == JsonValueKind.String)
                {
                    nameFilter = qEl.GetString();
                }
                if (filterDoc.RootElement.TryGetProperty("unitId", out var uEl) && uEl.TryGetInt32(out var uId))
                {
                    unitIdFilter = uId;
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
        if (unitIdFilter is not null)
        {
            whereClauses.Add("UnitId = @unitId");
        }
        var whereSql = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        int total;
        await using (var countCmd = connection.CreateCommand())
        {
            countCmd.CommandText = $"SELECT COUNT(*) FROM dbo.Residents {whereSql}";
            if (!string.IsNullOrWhiteSpace(nameFilter))
            {
                countCmd.Parameters.AddWithValue("@nameFilter", $"%{nameFilter}%");
            }
            if (unitIdFilter is not null)
            {
                countCmd.Parameters.AddWithValue("@unitId", unitIdFilter.Value);
            }
            total = (int)(await countCmd.ExecuteScalarAsync() ?? 0);
        }

        var residents = new List<ResidentDto>();
        await using (var cmd = connection.CreateCommand())
        {
            // sortField sale de un allow-list fijo de arriba, así que esta
            // interpolación es segura (nunca viene directo del usuario).
            cmd.CommandText = $@"
                SELECT {SelectColumns}
                FROM dbo.Residents
                {whereSql}
                ORDER BY {sortField} {sortDir}
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
            if (!string.IsNullOrWhiteSpace(nameFilter))
            {
                cmd.Parameters.AddWithValue("@nameFilter", $"%{nameFilter}%");
            }
            if (unitIdFilter is not null)
            {
                cmd.Parameters.AddWithValue("@unitId", unitIdFilter.Value);
            }
            cmd.Parameters.AddWithValue("@offset", start);
            cmd.Parameters.AddWithValue("@limit", Math.Max(end - start + 1, 1));

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                residents.Add(Read(reader));
            }
        }

        req.HttpContext.Response.Headers["Content-Range"] =
            $"residents {start}-{Math.Min(end, Math.Max(total - 1, 0))}/{total}";
        req.HttpContext.Response.Headers["Access-Control-Expose-Headers"] = "Content-Range";

        return new OkObjectResult(residents);
    }

    [Function("GetResident")]
    public async Task<IActionResult> GetOne(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "residents/{id:int}")] HttpRequest req, int id)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = $"SELECT {SelectColumns} FROM dbo.Residents WHERE ResidentId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    private static readonly HashSet<string> ValidRelationTypes = new(StringComparer.OrdinalIgnoreCase) { "owner", "tenant" };

    public record CreateResidentBody(
        string Name,
        string? Phone,
        string? Email,
        int? UnitId,
        string? RelationType,
        bool? Administrador,
        bool? SuperAdministrador,
        bool? Residente,
        bool? Guardia,
        bool? Active);

    [Function("CreateResident")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "residents")] HttpRequest req)
    {
        var body = await JsonSerializer.DeserializeAsync<CreateResidentBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body is null || string.IsNullOrWhiteSpace(body.Name))
        {
            return new BadRequestObjectResult(new { error = "Name is required." });
        }

        if (body.RelationType is not null && !ValidRelationTypes.Contains(body.RelationType))
        {
            return new BadRequestObjectResult(new { error = "RelationType must be 'owner' or 'tenant'." });
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO dbo.Residents
                (Name, Phone, Email, UnitId, RelationType, Administrador, SuperAdministrador, Residente, Guardia, Active)
            OUTPUT
                INSERTED.ResidentId, INSERTED.Name, INSERTED.Phone, INSERTED.Email, INSERTED.UnitId,
                INSERTED.RelationType, INSERTED.Administrador, INSERTED.SuperAdministrador,
                INSERTED.Residente, INSERTED.Guardia, INSERTED.Active, INSERTED.Auth0Sub
            VALUES
                (@name, @phone, @email, @unitId, @relationType, @administrador, @superAdministrador, @residente, @guardia, @active)";
        cmd.Parameters.AddWithValue("@name", body.Name);
        cmd.Parameters.AddWithValue("@phone", (object?)body.Phone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email", (object?)body.Email ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@unitId", (object?)body.UnitId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@relationType", (object?)body.RelationType ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@administrador", body.Administrador ?? false);
        cmd.Parameters.AddWithValue("@superAdministrador", body.SuperAdministrador ?? false);
        cmd.Parameters.AddWithValue("@residente", body.Residente ?? false);
        cmd.Parameters.AddWithValue("@guardia", body.Guardia ?? false);
        cmd.Parameters.AddWithValue("@active", body.Active ?? true);

        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        var created = Read(reader);

        return new CreatedResult($"/api/residents/{created.Id}", created);
    }

    public record UpdateResidentBody(
        string? Name,
        string? Phone,
        string? Email,
        int? UnitId,
        string? RelationType,
        bool? Administrador,
        bool? SuperAdministrador,
        bool? Residente,
        bool? Guardia,
        bool? Active);

    [Function("UpdateResident")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "residents/{id:int}")] HttpRequest req, int id)
    {
        var body = await JsonSerializer.DeserializeAsync<UpdateResidentBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body?.RelationType is not null && !ValidRelationTypes.Contains(body.RelationType))
        {
            return new BadRequestObjectResult(new { error = "RelationType must be 'owner' or 'tenant'." });
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        // Phone/Email/UnitId/RelationType usan asignación directa, no
        // COALESCE: son opcionales, así que dejarlos en blanco en la
        // edición debe poder borrar el valor guardado (igual que Address
        // en UpdateUnit) — para UnitId en particular, eso es lo que
        // permite pasar a alguien de "vive en una unidad" a "cuenta sin
        // unidad" (o viceversa).
        cmd.CommandText = @"
            UPDATE dbo.Residents
            SET Name = COALESCE(@name, Name),
                Phone = @phone,
                Email = @email,
                UnitId = @unitId,
                RelationType = @relationType,
                Administrador = COALESCE(@administrador, Administrador),
                SuperAdministrador = COALESCE(@superAdministrador, SuperAdministrador),
                Residente = COALESCE(@residente, Residente),
                Guardia = COALESCE(@guardia, Guardia),
                Active = COALESCE(@active, Active)
            OUTPUT
                INSERTED.ResidentId, INSERTED.Name, INSERTED.Phone, INSERTED.Email, INSERTED.UnitId,
                INSERTED.RelationType, INSERTED.Administrador, INSERTED.SuperAdministrador,
                INSERTED.Residente, INSERTED.Guardia, INSERTED.Active, INSERTED.Auth0Sub
            WHERE ResidentId = @id";
        cmd.Parameters.AddWithValue("@name", (object?)body?.Name ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@phone", (object?)body?.Phone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email", (object?)body?.Email ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@unitId", (object?)body?.UnitId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@relationType", (object?)body?.RelationType ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@administrador", (object?)body?.Administrador ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@superAdministrador", (object?)body?.SuperAdministrador ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@residente", (object?)body?.Residente ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@guardia", (object?)body?.Guardia ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@active", (object?)body?.Active ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    [Function("DeleteResident")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "residents/{id:int}")] HttpRequest req, int id)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM dbo.Residents OUTPUT DELETED.ResidentId WHERE ResidentId = @id";
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
            // FK violation: este residente todavía tiene pagos, códigos de
            // acceso, etc. que lo referencian. Sin ON DELETE CASCADE a
            // propósito (perder ese historial por accidente sería peor que
            // este error) — desactivar (Active = false) es la salida normal
            // en vez de eliminar.
            _logger.LogWarning(ex, "DeleteResident {Id} blocked by a foreign key.", id);
            return new ConflictObjectResult(new { error = "No se puede eliminar: este residente tiene registros relacionados (pagos, códigos de acceso, etc.). Desactívalo en vez de eliminarlo." });
        }
    }
}
