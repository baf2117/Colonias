using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Neighborhood.Database;

namespace Neighborhood;

// First real CRUD resource, built to prove the react-admin dataProvider
// wiring end to end (ra-data-simple-rest's protocol: range/sort query
// params, a Content-Range response header for lists, "id" in every
// record). Units is the simplest table we have, so it's the smoke test —
// the same shape gets reused for Residents, Vehicles, etc. later.
public class Units
{
    private readonly ILogger<Units> _logger;

    public Units(ILogger<Units> logger)
    {
        _logger = logger;
    }

    public record UnitDto(int Id, string Identifier, bool Active);

    [Function("GetUnits")]
    public async Task<IActionResult> GetList(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "units")] HttpRequest req)
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

        var sortField = "UnitId";
        var sortDir = "ASC";
        if (req.Query.TryGetValue("sort", out var sortRaw))
        {
            var sort = JsonSerializer.Deserialize<string[]>(sortRaw.ToString());
            if (sort is { Length: 2 })
            {
                sortField = sort[0] switch
                {
                    "id" => "UnitId",
                    "identifier" => "Identifier",
                    "active" => "Active",
                    _ => "UnitId",
                };
                sortDir = sort[1].Equals("DESC", StringComparison.OrdinalIgnoreCase) ? "DESC" : "ASC";
            }
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        int total;
        await using (var countCmd = connection.CreateCommand())
        {
            countCmd.CommandText = "SELECT COUNT(*) FROM dbo.Units";
            total = (int)(await countCmd.ExecuteScalarAsync() ?? 0);
        }

        var units = new List<UnitDto>();
        await using (var cmd = connection.CreateCommand())
        {
            // sortField is constrained to a fixed allow-list above, so this
            // interpolation is safe (never comes straight from user input).
            cmd.CommandText = $@"
                SELECT UnitId, Identifier, Active
                FROM dbo.Units
                ORDER BY {sortField} {sortDir}
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
            cmd.Parameters.AddWithValue("@offset", start);
            cmd.Parameters.AddWithValue("@limit", Math.Max(end - start + 1, 1));

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                units.Add(new UnitDto(
                    reader.GetInt32(reader.GetOrdinal("UnitId")),
                    reader.GetString(reader.GetOrdinal("Identifier")),
                    reader.GetBoolean(reader.GetOrdinal("Active"))));
            }
        }

        req.HttpContext.Response.Headers["Content-Range"] =
            $"units {start}-{Math.Min(end, Math.Max(total - 1, 0))}/{total}";
        req.HttpContext.Response.Headers["Access-Control-Expose-Headers"] = "Content-Range";

        return new OkObjectResult(units);
    }

    [Function("GetUnit")]
    public async Task<IActionResult> GetOne(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "units/{id:int}")] HttpRequest req, int id)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT UnitId, Identifier, Active FROM dbo.Units WHERE UnitId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(new UnitDto(
            reader.GetInt32(reader.GetOrdinal("UnitId")),
            reader.GetString(reader.GetOrdinal("Identifier")),
            reader.GetBoolean(reader.GetOrdinal("Active"))));
    }

    public record CreateUnitBody(string Identifier, bool? Active);

    [Function("CreateUnit")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "units")] HttpRequest req)
    {
        var body = await JsonSerializer.DeserializeAsync<CreateUnitBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body is null || string.IsNullOrWhiteSpace(body.Identifier))
        {
            return new BadRequestObjectResult(new { error = "Identifier is required." });
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO dbo.Units (Identifier, Active)
            OUTPUT INSERTED.UnitId, INSERTED.Identifier, INSERTED.Active
            VALUES (@identifier, @active)";
        cmd.Parameters.AddWithValue("@identifier", body.Identifier);
        cmd.Parameters.AddWithValue("@active", body.Active ?? true);

        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        var created = new UnitDto(
            reader.GetInt32(reader.GetOrdinal("UnitId")),
            reader.GetString(reader.GetOrdinal("Identifier")),
            reader.GetBoolean(reader.GetOrdinal("Active")));

        return new CreatedResult($"/api/units/{created.Id}", created);
    }

    public record UpdateUnitBody(string? Identifier, bool? Active);

    [Function("UpdateUnit")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "units/{id:int}")] HttpRequest req, int id)
    {
        var body = await JsonSerializer.DeserializeAsync<UpdateUnitBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            UPDATE dbo.Units
            SET Identifier = COALESCE(@identifier, Identifier),
                Active = COALESCE(@active, Active)
            OUTPUT INSERTED.UnitId, INSERTED.Identifier, INSERTED.Active
            WHERE UnitId = @id";
        cmd.Parameters.AddWithValue("@identifier", (object?)body?.Identifier ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@active", (object?)body?.Active ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(new UnitDto(
            reader.GetInt32(reader.GetOrdinal("UnitId")),
            reader.GetString(reader.GetOrdinal("Identifier")),
            reader.GetBoolean(reader.GetOrdinal("Active"))));
    }

    [Function("DeleteUnit")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "units/{id:int}")] HttpRequest req, int id)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM dbo.Units OUTPUT DELETED.UnitId WHERE UnitId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        var deletedId = await cmd.ExecuteScalarAsync();
        if (deletedId is null)
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(new { id = (int)deletedId });
    }
}
