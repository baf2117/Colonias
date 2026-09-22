using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Neighborhood.Auth;
using Neighborhood.Database;

namespace Neighborhood;

// CRUD de proveedores (dbo.Vendors), calcado del patrón de Units.cs /
// Neighborhoods.cs. NeighborhoodId es NOT NULL desde la migración
// 0002_neighborhoods.sql — todo proveedor pertenece a una colonia.
//
// Este recurso no tiene pantallas propias en el menú: el flujo elegido
// es crear el proveedor al vuelo desde el formulario de Crear Gasto
// (ver web/src/vendors/CreateVendorDialog.tsx y web/src/expenses/
// ExpenseCreate.tsx) en vez de una sección de "Proveedores" aparte. El
// CRUD completo igual vive acá porque GetList con "filter.q" es lo que
// alimenta el autocompletar de proveedor al escribir, y GetOne es lo
// que resuelve el nombre del proveedor en la lista/detalle de Gastos.
public class Vendors
{
    private readonly ILogger<Vendors> _logger;

    public Vendors(ILogger<Vendors> logger)
    {
        _logger = logger;
    }

    public record VendorDto(int Id, string Name, string? Phone, bool Active, int NeighborhoodId);

    private const string SelectColumns = "VendorId, Name, Phone, Active, NeighborhoodId";

    private static VendorDto Read(Microsoft.Data.SqlClient.SqlDataReader reader) => new(
        reader.GetInt32(reader.GetOrdinal("VendorId")),
        reader.GetString(reader.GetOrdinal("Name")),
        reader.IsDBNull(reader.GetOrdinal("Phone")) ? null : reader.GetString(reader.GetOrdinal("Phone")),
        reader.GetBoolean(reader.GetOrdinal("Active")),
        reader.GetInt32(reader.GetOrdinal("NeighborhoodId")));

    // Mismo criterio y misma forma que ResolveNeighborhoodScope en
    // Units.cs/Residents.cs (se duplica, cada recurso es autocontenido):
    // un SuperAdministrador elige la colonia del proveedor a mano (ver
    // CreateVendorDialog.tsx); un Administrador queda SIEMPRE acotado a
    // la suya (currentUser.NeighborhoodId) -- sin colonia asignada
    // todavía, no ve ni puede crear ningún proveedor.
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

    [Function("GetVendors")]
    public async Task<IActionResult> GetList(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "vendors")] HttpRequest req)
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

        var sortField = "VendorId";
        var sortDir = "ASC";
        if (req.Query.TryGetValue("sort", out var sortRaw))
        {
            var sort = JsonSerializer.Deserialize<string[]>(sortRaw.ToString());
            if (sort is { Length: 2 })
            {
                sortField = sort[0] switch
                {
                    "id" => "VendorId",
                    "name" => "Name",
                    "phone" => "Phone",
                    "active" => "Active",
                    "neighborhoodId" => "NeighborhoodId",
                    _ => "VendorId",
                };
                sortDir = sort[1].Equals("DESC", StringComparison.OrdinalIgnoreCase) ? "DESC" : "ASC";
            }
        }

        // filter.q: texto libre que el AutocompleteInput de react-admin manda
        // mientras se escribe (busca por Name). filter.neighborhoodId: para
        // acotar el picker a una colonia puntual, si hace falta más adelante.
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

        // Un Administrador ignora cualquier filter.neighborhoodId que
        // mande el cliente y queda SIEMPRE acotado a su propia colonia
        // (ver ResolveNeighborhoodScope); un SuperAdministrador solo se
        // acota si él mismo pidió el filtro.
        var scope = ResolveNeighborhoodScope(req);
        if (scope.IsScoped && scope.NeighborhoodId is null)
        {
            req.HttpContext.Response.Headers["Content-Range"] = "vendors 0-0/0";
            req.HttpContext.Response.Headers["Access-Control-Expose-Headers"] = "Content-Range";
            return new OkObjectResult(Array.Empty<VendorDto>());
        }
        var effectiveNeighborhoodId = scope.IsScoped ? scope.NeighborhoodId : neighborhoodIdFilter;

        var whereClauses = new List<string>();
        if (!string.IsNullOrWhiteSpace(nameFilter))
        {
            whereClauses.Add("Name LIKE @nameFilter");
        }
        if (effectiveNeighborhoodId is not null)
        {
            whereClauses.Add("NeighborhoodId = @neighborhoodId");
        }
        var whereSql = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        int total;
        await using (var countCmd = connection.CreateCommand())
        {
            countCmd.CommandText = $"SELECT COUNT(*) FROM dbo.Vendors {whereSql}";
            if (!string.IsNullOrWhiteSpace(nameFilter))
            {
                countCmd.Parameters.AddWithValue("@nameFilter", $"%{nameFilter}%");
            }
            if (effectiveNeighborhoodId is not null)
            {
                countCmd.Parameters.AddWithValue("@neighborhoodId", effectiveNeighborhoodId.Value);
            }
            total = (int)(await countCmd.ExecuteScalarAsync() ?? 0);
        }

        var vendors = new List<VendorDto>();
        await using (var cmd = connection.CreateCommand())
        {
            // sortField sale de un allow-list fijo de arriba, así que esta
            // interpolación es segura (nunca viene directo del usuario).
            cmd.CommandText = $@"
                SELECT {SelectColumns}
                FROM dbo.Vendors
                {whereSql}
                ORDER BY {sortField} {sortDir}
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
            if (!string.IsNullOrWhiteSpace(nameFilter))
            {
                cmd.Parameters.AddWithValue("@nameFilter", $"%{nameFilter}%");
            }
            if (effectiveNeighborhoodId is not null)
            {
                cmd.Parameters.AddWithValue("@neighborhoodId", effectiveNeighborhoodId.Value);
            }
            cmd.Parameters.AddWithValue("@offset", start);
            cmd.Parameters.AddWithValue("@limit", Math.Max(end - start + 1, 1));

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                vendors.Add(Read(reader));
            }
        }

        req.HttpContext.Response.Headers["Content-Range"] =
            $"vendors {start}-{Math.Min(end, Math.Max(total - 1, 0))}/{total}";
        req.HttpContext.Response.Headers["Access-Control-Expose-Headers"] = "Content-Range";

        return new OkObjectResult(vendors);
    }

    [Function("GetVendor")]
    public async Task<IActionResult> GetOne(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "vendors/{id:int}")] HttpRequest req, int id)
    {
        var scope = ResolveNeighborhoodScope(req);
        var scopeSql = scope.IsScoped ? "AND NeighborhoodId = @scopeNeighborhoodId" : "";

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = $"SELECT {SelectColumns} FROM dbo.Vendors WHERE VendorId = @id {scopeSql}";
        cmd.Parameters.AddWithValue("@id", id);
        if (scope.IsScoped)
        {
            cmd.Parameters.AddWithValue("@scopeNeighborhoodId", (object?)scope.NeighborhoodId ?? DBNull.Value);
        }

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    public record CreateVendorBody(string Name, string? Phone, bool? Active, int NeighborhoodId);

    [Function("CreateVendor")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "vendors")] HttpRequest req)
    {
        var body = await JsonSerializer.DeserializeAsync<CreateVendorBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body is null || string.IsNullOrWhiteSpace(body.Name))
        {
            return new BadRequestObjectResult(new { error = "Name is required." });
        }

        // Un Administrador crea el proveedor directo en SU colonia --
        // se ignora lo que haya mandado el body para NeighborhoodId
        // (mismo criterio que CreateUnit en Units.cs). Un
        // SuperAdministrador sí elige la colonia (ver CreateVendorDialog.tsx).
        var scope = ResolveNeighborhoodScope(req);
        int effectiveNeighborhoodId;
        if (scope.IsScoped)
        {
            if (scope.NeighborhoodId is null)
            {
                return new BadRequestObjectResult(new
                {
                    error = "No tenés una colonia asignada. Pedile a un superadministrador que te asigne una.",
                    message = "No tenés una colonia asignada. Pedile a un superadministrador que te asigne una.",
                });
            }
            effectiveNeighborhoodId = scope.NeighborhoodId.Value;
        }
        else
        {
            if (body.NeighborhoodId <= 0)
            {
                return new BadRequestObjectResult(new { error = "NeighborhoodId is required." });
            }
            effectiveNeighborhoodId = body.NeighborhoodId;
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO dbo.Vendors (Name, Phone, Active, NeighborhoodId)
            OUTPUT INSERTED.VendorId, INSERTED.Name, INSERTED.Phone, INSERTED.Active, INSERTED.NeighborhoodId
            VALUES (@name, @phone, @active, @neighborhoodId)";
        cmd.Parameters.AddWithValue("@name", body.Name);
        cmd.Parameters.AddWithValue("@phone", (object?)body.Phone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@active", body.Active ?? true);
        cmd.Parameters.AddWithValue("@neighborhoodId", effectiveNeighborhoodId);

        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        var created = Read(reader);

        return new CreatedResult($"/api/vendors/{created.Id}", created);
    }

    public record UpdateVendorBody(string? Name, string? Phone, bool? Active, int? NeighborhoodId);

    [Function("UpdateVendor")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "vendors/{id:int}")] HttpRequest req, int id)
    {
        var body = await JsonSerializer.DeserializeAsync<UpdateVendorBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        // Un Administrador no puede editar un proveedor de otra colonia
        // (404, mismo criterio que UpdateUnit/UpdateResident) ni mudarlo
        // a otra colonia (se ignora NeighborhoodId del body si está
        // acotado).
        var scope = ResolveNeighborhoodScope(req);
        if (scope.IsScoped)
        {
            var currentNeighborhoodId = await FindVendorNeighborhoodIdAsync(connection, id);
            if (currentNeighborhoodId is null || currentNeighborhoodId != scope.NeighborhoodId)
            {
                return new NotFoundResult();
            }
        }

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            UPDATE dbo.Vendors
            SET Name = COALESCE(@name, Name),
                Phone = COALESCE(@phone, Phone),
                Active = COALESCE(@active, Active),
                NeighborhoodId = COALESCE(@neighborhoodId, NeighborhoodId)
            OUTPUT INSERTED.VendorId, INSERTED.Name, INSERTED.Phone, INSERTED.Active, INSERTED.NeighborhoodId
            WHERE VendorId = @id";
        cmd.Parameters.AddWithValue("@name", (object?)body?.Name ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@phone", (object?)body?.Phone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@active", (object?)body?.Active ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@neighborhoodId", scope.IsScoped ? DBNull.Value : (object?)body?.NeighborhoodId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(Read(reader));
    }

    // Compartido por Update/Delete para chequear el alcance por colonia
    // de un Administrador antes de tocar la fila. Devuelve null si el
    // proveedor no existe.
    private static async Task<int?> FindVendorNeighborhoodIdAsync(Microsoft.Data.SqlClient.SqlConnection connection, int vendorId)
    {
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT NeighborhoodId FROM dbo.Vendors WHERE VendorId = @id";
        cmd.Parameters.AddWithValue("@id", vendorId);
        var result = await cmd.ExecuteScalarAsync();
        return result is null ? null : (int)result;
    }

    [Function("DeleteVendor")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "vendors/{id:int}")] HttpRequest req, int id)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        var scope = ResolveNeighborhoodScope(req);
        if (scope.IsScoped)
        {
            var currentNeighborhoodId = await FindVendorNeighborhoodIdAsync(connection, id);
            if (currentNeighborhoodId is null || currentNeighborhoodId != scope.NeighborhoodId)
            {
                return new NotFoundResult();
            }
        }

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM dbo.Vendors OUTPUT DELETED.VendorId WHERE VendorId = @id";
        cmd.Parameters.AddWithValue("@id", id);

        var deletedId = await cmd.ExecuteScalarAsync();
        if (deletedId is null)
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(new { id = (int)deletedId });
    }
}
