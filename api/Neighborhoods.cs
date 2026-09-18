using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Neighborhood.Database;

namespace Neighborhood;

// Segundo recurso CRUD real, calcado del patrón de Units.cs (mismo shape
// que espera ra-data-simple-rest: range/sort por query string, header
// Content-Range en la lista, "id" en cada registro). dbo.Neighborhoods es
// la tabla raíz del modelo multi-colonia (ver migrations/0002_neighborhoods.sql
// y 0003_merge_colonysettings_into_neighborhoods.sql — esta última ya
// corrida, así que los tres switches de configuración viven acá y no en
// una tabla ColonySettings aparte).
public class Neighborhoods
{
    private readonly ILogger<Neighborhoods> _logger;

    public Neighborhoods(ILogger<Neighborhoods> logger)
    {
        _logger = logger;
    }

    public record NeighborhoodDto(
        int Id,
        string Name,
        bool Active,
        bool TemporaryCodesEnabled,
        bool PermanentCodesEnabled,
        bool DenyAccessEnabled);

    private const string SelectColumns =
        "NeighborhoodId, Name, Active, TemporaryCodesEnabled, PermanentCodesEnabled, DenyAccessEnabled";

    private static NeighborhoodDto Read(Microsoft.Data.SqlClient.SqlDataReader reader) => new(
        reader.GetInt32(reader.GetOrdinal("NeighborhoodId")),
        reader.GetString(reader.GetOrdinal("Name")),
        reader.GetBoolean(reader.GetOrdinal("Active")),
        reader.GetBoolean(reader.GetOrdinal("TemporaryCodesEnabled")),
        reader.GetBoolean(reader.GetOrdinal("PermanentCodesEnabled")),
        reader.GetBoolean(reader.GetOrdinal("DenyAccessEnabled")));

    [Function("GetNeighborhoods")]
    public async Task<IActionResult> GetList(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "neighborhoods")] HttpRequest req)
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

        var sortField = "NeighborhoodId";
        var sortDir = "ASC";
        if (req.Query.TryGetValue("sort", out var sortRaw))
        {
            var sort = JsonSerializer.Deserialize<string[]>(sortRaw.ToString());
            if (sort is { Length: 2 })
            {
                sortField = sort[0] switch
                {
                    "id" => "NeighborhoodId",
                    "name" => "Name",
                    "active" => "Active",
                    "temporaryCodesEnabled" => "TemporaryCodesEnabled",
                    "permanentCodesEnabled" => "PermanentCodesEnabled",
                    "denyAccessEnabled" => "DenyAccessEnabled",
                    _ => "NeighborhoodId",
                };
                sortDir = sort[1].Equals("DESC", StringComparison.OrdinalIgnoreCase) ? "DESC" : "ASC";
            }
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        int total;
        await using (var countCmd = connection.CreateCommand())
        {
            countCmd.CommandText = "SELECT COUNT(*) FROM dbo.Neighborhoods";
            total = (int)(await countCmd.ExecuteScalarAsync() ?? 0);
        }

        var neighborhoods = new List<NeighborhoodDto>();
        await using (var cmd = connection.CreateCommand())
        {
            // sortField is constrained to a fixed allow-list above, so this
            // interpolation is safe (never comes straight from user input).
            cmd.CommandText = $@"
                SELECT {SelectColumns}
                FROM dbo.Neighborhoods
                ORDER BY {sortField} {sortDir}
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
            cmd.Parameters.AddWithValue("@offset", start);
            cmd.Parameters.AddWithValue("@limit", Math.Max(end - start + 1, 1));

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                neighborhoods.Add(Read(reader));
            }
        }

        req.HttpContext.Response.Headers["Content-Range"] =
            $"neighborhoods {start}-{Math.Min(end, Math.Max(total - 1, 0))}/{total}";
        req.HttpContext.Response.Headers["Access-Control-Expose-Headers"] = "Content-Range";

        return new OkObjectResult(neighborhoods);
    }

    [Function("GetNeighborhood")]
    public async Task<IActionResult> GetOne(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "neighborhoods/{id:int}")] HttpRequest req, int id)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = $"SELECT {SelectColumns} FROM dbo.Neighborhoods WHERE NeighborhoodId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    public record CreateNeighborhoodBody(
        string Name,
        bool? Active,
        bool? TemporaryCodesEnabled,
        bool? PermanentCodesEnabled,
        bool? DenyAccessEnabled);

    [Function("CreateNeighborhood")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "neighborhoods")] HttpRequest req)
    {
        var body = await JsonSerializer.DeserializeAsync<CreateNeighborhoodBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body is null || string.IsNullOrWhiteSpace(body.Name))
        {
            return new BadRequestObjectResult(new { error = "Name is required." });
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO dbo.Neighborhoods (Name, Active, TemporaryCodesEnabled, PermanentCodesEnabled, DenyAccessEnabled)
            OUTPUT INSERTED.NeighborhoodId, INSERTED.Name, INSERTED.Active,
                   INSERTED.TemporaryCodesEnabled, INSERTED.PermanentCodesEnabled, INSERTED.DenyAccessEnabled
            VALUES (@name, @active, @temporaryCodesEnabled, @permanentCodesEnabled, @denyAccessEnabled)";
        cmd.Parameters.AddWithValue("@name", body.Name);
        cmd.Parameters.AddWithValue("@active", body.Active ?? true);
        // Mismos defaults que la migración 0003 le dio a estas columnas
        // (DF_Neighborhoods_...): temporales y permanentes habilitados,
        // denegar acceso deshabilitado.
        cmd.Parameters.AddWithValue("@temporaryCodesEnabled", body.TemporaryCodesEnabled ?? true);
        cmd.Parameters.AddWithValue("@permanentCodesEnabled", body.PermanentCodesEnabled ?? true);
        cmd.Parameters.AddWithValue("@denyAccessEnabled", body.DenyAccessEnabled ?? false);

        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        var created = Read(reader);

        return new CreatedResult($"/api/neighborhoods/{created.Id}", created);
    }

    public record UpdateNeighborhoodBody(
        string? Name,
        bool? Active,
        bool? TemporaryCodesEnabled,
        bool? PermanentCodesEnabled,
        bool? DenyAccessEnabled);

    [Function("UpdateNeighborhood")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "neighborhoods/{id:int}")] HttpRequest req, int id)
    {
        var body = await JsonSerializer.DeserializeAsync<UpdateNeighborhoodBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            UPDATE dbo.Neighborhoods
            SET Name = COALESCE(@name, Name),
                Active = COALESCE(@active, Active),
                TemporaryCodesEnabled = COALESCE(@temporaryCodesEnabled, TemporaryCodesEnabled),
                PermanentCodesEnabled = COALESCE(@permanentCodesEnabled, PermanentCodesEnabled),
                DenyAccessEnabled = COALESCE(@denyAccessEnabled, DenyAccessEnabled)
            OUTPUT INSERTED.NeighborhoodId, INSERTED.Name, INSERTED.Active,
                   INSERTED.TemporaryCodesEnabled, INSERTED.PermanentCodesEnabled, INSERTED.DenyAccessEnabled
            WHERE NeighborhoodId = @id";
        cmd.Parameters.AddWithValue("@name", (object?)body?.Name ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@active", (object?)body?.Active ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@temporaryCodesEnabled", (object?)body?.TemporaryCodesEnabled ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@permanentCodesEnabled", (object?)body?.PermanentCodesEnabled ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@denyAccessEnabled", (object?)body?.DenyAccessEnabled ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    [Function("DeleteNeighborhood")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "neighborhoods/{id:int}")] HttpRequest req, int id)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM dbo.Neighborhoods OUTPUT DELETED.NeighborhoodId WHERE NeighborhoodId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        var deletedId = await cmd.ExecuteScalarAsync();
        if (deletedId is null)
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(new { id = (int)deletedId });
    }
}
