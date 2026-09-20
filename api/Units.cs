using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Neighborhood.Database;

namespace Neighborhood;

// Primer recurso CRUD real del proyecto (ver comentario original de esta
// clase), extendido acá para el CRUD completo desde el dashboard:
// lista, creación, detalle y edición (con borrado incluido en el toolbar
// por defecto de Edit). NeighborhoodId se agregó en la migración
// 0002_neighborhoods.sql como NOT NULL con FK a dbo.Neighborhoods —
// cada Unit pertenece a exactamente una Colonia, así que viaja en el DTO
// y es obligatorio en Create/Update.
//
// FeeAmount (migración 0005) es opcional: NULL significa que la unidad
// usa la cuota general de su colonia (Neighborhoods.DefaultFeeAmount);
// un valor acá la reemplaza solo para esta unidad. dbo.Fees ya no
// existe — esa fila por unidad y por mes se reemplazó por este único
// valor "vigente hasta que cambie".
public class Units
{
    private readonly ILogger<Units> _logger;

    public Units(ILogger<Units> logger)
    {
        _logger = logger;
    }

    public record UnitDto(int Id, string Identifier, bool Active, int NeighborhoodId, string? Address, decimal? FeeAmount);

    private const string SelectColumns = "UnitId, Identifier, Active, NeighborhoodId, Address, FeeAmount";

    private static UnitDto Read(Microsoft.Data.SqlClient.SqlDataReader reader) => new(
        reader.GetInt32(reader.GetOrdinal("UnitId")),
        reader.GetString(reader.GetOrdinal("Identifier")),
        reader.GetBoolean(reader.GetOrdinal("Active")),
        reader.GetInt32(reader.GetOrdinal("NeighborhoodId")),
        reader.IsDBNull(reader.GetOrdinal("Address")) ? null : reader.GetString(reader.GetOrdinal("Address")),
        reader.IsDBNull(reader.GetOrdinal("FeeAmount")) ? null : reader.GetDecimal(reader.GetOrdinal("FeeAmount")));

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
                    "neighborhoodId" => "NeighborhoodId",
                    "address" => "Address",
                    "feeAmount" => "FeeAmount",
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
                SELECT {SelectColumns}
                FROM dbo.Units
                ORDER BY {sortField} {sortDir}
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
            cmd.Parameters.AddWithValue("@offset", start);
            cmd.Parameters.AddWithValue("@limit", Math.Max(end - start + 1, 1));

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                units.Add(Read(reader));
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
        cmd.CommandText = $"SELECT {SelectColumns} FROM dbo.Units WHERE UnitId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    public record CreateUnitBody(string Identifier, bool? Active, int NeighborhoodId, string? Address, decimal? FeeAmount);

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

        if (body.NeighborhoodId <= 0)
        {
            return new BadRequestObjectResult(new { error = "NeighborhoodId is required." });
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO dbo.Units (Identifier, Active, NeighborhoodId, Address, FeeAmount)
            OUTPUT INSERTED.UnitId, INSERTED.Identifier, INSERTED.Active, INSERTED.NeighborhoodId, INSERTED.Address, INSERTED.FeeAmount
            VALUES (@identifier, @active, @neighborhoodId, @address, @feeAmount)";
        cmd.Parameters.AddWithValue("@identifier", body.Identifier);
        cmd.Parameters.AddWithValue("@active", body.Active ?? true);
        cmd.Parameters.AddWithValue("@neighborhoodId", body.NeighborhoodId);
        cmd.Parameters.AddWithValue("@address", (object?)body.Address ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@feeAmount", (object?)body.FeeAmount ?? DBNull.Value);

        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        var created = Read(reader);

        return new CreatedResult($"/api/units/{created.Id}", created);
    }

    public record UpdateUnitBody(string? Identifier, bool? Active, int? NeighborhoodId, string? Address, decimal? FeeAmount);

    [Function("UpdateUnit")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "units/{id:int}")] HttpRequest req, int id)
    {
        var body = await JsonSerializer.DeserializeAsync<UpdateUnitBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        // Address y FeeAmount usan asignación directa, no COALESCE como el
        // resto: son campos opcionales (a diferencia de Identifier/Active/
        // NeighborhoodId, que el formulario siempre manda), así que dejarlos
        // en blanco en la edición debe poder borrar el valor guardado — para
        // FeeAmount en particular, eso es lo que hace que la unidad vuelva a
        // usar la cuota general de la colonia.
        cmd.CommandText = @"
            UPDATE dbo.Units
            SET Identifier = COALESCE(@identifier, Identifier),
                Active = COALESCE(@active, Active),
                NeighborhoodId = COALESCE(@neighborhoodId, NeighborhoodId),
                Address = @address,
                FeeAmount = @feeAmount
            OUTPUT INSERTED.UnitId, INSERTED.Identifier, INSERTED.Active, INSERTED.NeighborhoodId, INSERTED.Address, INSERTED.FeeAmount
            WHERE UnitId = @id";
        cmd.Parameters.AddWithValue("@identifier", (object?)body?.Identifier ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@active", (object?)body?.Active ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@neighborhoodId", (object?)body?.NeighborhoodId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@address", (object?)body?.Address ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@feeAmount", (object?)body?.FeeAmount ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
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
