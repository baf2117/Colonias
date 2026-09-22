using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Neighborhood.Auth;
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
//
// RegistrationCode es el código que un residente usa para auto-registrarse
// (ver Residents.cs → RegisterResident): se genera solo al crear la
// unidad, no viaja en UpdateUnitBody (no es editable desde el dashboard
// por ahora).
public class Units
{
    private readonly ILogger<Units> _logger;

    public Units(ILogger<Units> logger)
    {
        _logger = logger;
    }

    public record UnitDto(int Id, string Identifier, bool Active, int NeighborhoodId, string? Address, decimal? FeeAmount, string RegistrationCode);

    private const string SelectColumns = "UnitId, Identifier, Active, NeighborhoodId, Address, FeeAmount, RegistrationCode";

    private static UnitDto Read(Microsoft.Data.SqlClient.SqlDataReader reader) => new(
        reader.GetInt32(reader.GetOrdinal("UnitId")),
        reader.GetString(reader.GetOrdinal("Identifier")),
        reader.GetBoolean(reader.GetOrdinal("Active")),
        reader.GetInt32(reader.GetOrdinal("NeighborhoodId")),
        reader.IsDBNull(reader.GetOrdinal("Address")) ? null : reader.GetString(reader.GetOrdinal("Address")),
        reader.IsDBNull(reader.GetOrdinal("FeeAmount")) ? null : reader.GetDecimal(reader.GetOrdinal("FeeAmount")),
        reader.GetString(reader.GetOrdinal("RegistrationCode")));

    // Alfabeto sin 0/O/1/I/L (se confunden fácilmente cuando el admin se lo
    // dicta o lo escribe a mano a un residente).
    private const string RegistrationCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    private static string GenerateRegistrationCode()
    {
        var chars = new char[6];
        for (var i = 0; i < chars.Length; i++)
        {
            chars[i] = RegistrationCodeAlphabet[Random.Shared.Next(RegistrationCodeAlphabet.Length)];
        }
        return new string(chars);
    }

    // Unidades vive en el grupo Administración del menú, junto con Gastos y
    // Guardias: el usuario pidió que toda esa sección (listar, ver, crear,
    // editar, borrar) sea solo para Administrador/SuperAdministrador,
    // mismo criterio de bloqueo total que ya se usó en Residents.cs. Eso
    // implica que PaymentShow/PaymentList (ReferenceField de unidad) van a
    // mostrar ese campo vacío para otros roles — consecuencia aceptada,
    // igual que pasó con el nombre del residente en Payments.
    private static IActionResult? RequireAdminOrSuperAdmin(HttpRequest req)
    {
        var currentUser = req.HttpContext.GetCurrentUser();
        if (currentUser is null || !(currentUser.Administrador || currentUser.SuperAdministrador))
        {
            return new ObjectResult(new
            {
                error = "Solo un administrador puede acceder a las unidades.",
                message = "Solo un administrador puede acceder a las unidades.",
            })
            { StatusCode = StatusCodes.Status403Forbidden };
        }
        return null;
    }

    // Determina si Unidades debe acotarse a una sola colonia para quien
    // llama, y a cuál. Un SuperAdministrador nunca se acota -- puede ver
    // todas y filtrar por colonia si quiere (filter.neighborhoodId en
    // GetList). Un Administrador SIEMPRE se acota a su propia colonia
    // (currentUser.NeighborhoodId, dbo.Residents.NeighborhoodId, ver
    // RequireCanAssignNeighborhood en Residents.cs) -- NeighborhoodId
    // null significa que todavía nadie se la asignó, y en ese caso no ve
    // NINGUNA unidad (nunca "todas"), ver GetList más abajo.
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

    // Autoservicio: cualquier residente puede ver los datos básicos de SU
    // PROPIA unidad (resuelta del lado del servidor a partir de su propio
    // Auth0Sub vía GetCurrentUser().UnitId, nunca de un id que mande el
    // cliente) sin necesitar rol de administrador — el usuario pidió que
    // el Panel general le muestre a un residente la unidad a la que
    // pertenece. Por eso esta función NO pasa por RequireAdminOrSuperAdmin
    // (a diferencia de GetList/GetOne de abajo) y usa un DTO más chico que
    // UnitDto: sin RegistrationCode, que es un secreto para auto-registrar
    // OTROS residentes de la unidad y no debería viajar acá. Un guardia
    // (sin fila en Residents, GetCurrentUser() null) o un residente sin
    // unidad asignada (UnitId null) reciben 404 — no hay nada que mostrar.
    public record MyUnitDto(int Id, string Identifier, int NeighborhoodId, string? Address, decimal? FeeAmount);

    private static MyUnitDto ReadMine(Microsoft.Data.SqlClient.SqlDataReader reader) => new(
        reader.GetInt32(reader.GetOrdinal("UnitId")),
        reader.GetString(reader.GetOrdinal("Identifier")),
        reader.GetInt32(reader.GetOrdinal("NeighborhoodId")),
        reader.IsDBNull(reader.GetOrdinal("Address")) ? null : reader.GetString(reader.GetOrdinal("Address")),
        reader.IsDBNull(reader.GetOrdinal("FeeAmount")) ? null : reader.GetDecimal(reader.GetOrdinal("FeeAmount")));

    [Function("GetMyUnit")]
    public async Task<IActionResult> GetMine(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "units/mine")] HttpRequest req)
    {
        var currentUser = req.HttpContext.GetCurrentUser();
        if (currentUser?.UnitId is null)
        {
            return new NotFoundResult();
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT UnitId, Identifier, NeighborhoodId, Address, FeeAmount FROM dbo.Units WHERE UnitId = @unitId";
        cmd.Parameters.AddWithValue("@unitId", currentUser.UnitId.Value);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new NotFoundResult();
        }

        return new OkObjectResult(ReadMine(reader));
    }

    [Function("GetUnits")]
    public async Task<IActionResult> GetList(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "units")] HttpRequest req)
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

        // filter.neighborhoodId: el filtro por colonia que pidió el
        // usuario para la vista de SuperAdministrador. Un Administrador
        // no lo necesita (ni el frontend se lo muestra, ver UnitList.tsx)
        // porque más abajo se lo fuerza de todos modos a su propia
        // colonia -- si de algún modo llegara este filtro en su request,
        // se ignora en vez de dejarlo ver otra colonia.
        int? filterNeighborhoodId = null;
        if (req.Query.TryGetValue("filter", out var filterRaw))
        {
            try
            {
                using var filterDoc = JsonDocument.Parse(filterRaw.ToString());
                if (filterDoc.RootElement.TryGetProperty("neighborhoodId", out var nEl) && nEl.TryGetInt32(out var nId))
                {
                    filterNeighborhoodId = nId;
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
            // Administrador sin colonia asignada todavía: no ve ninguna
            // unidad (no "todas"). Se corta acá, sin pegarle a la base.
            req.HttpContext.Response.Headers["Content-Range"] = "units 0-0/0";
            req.HttpContext.Response.Headers["Access-Control-Expose-Headers"] = "Content-Range";
            return new OkObjectResult(Array.Empty<UnitDto>());
        }

        // Un Administrador siempre queda acotado a su propia colonia
        // (ignora cualquier filter.neighborhoodId que mande el cliente);
        // un SuperAdministrador solo se acota si él mismo pidió el
        // filtro.
        var effectiveNeighborhoodId = scope.IsScoped ? scope.NeighborhoodId : filterNeighborhoodId;

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        var whereSql = effectiveNeighborhoodId is not null ? "WHERE NeighborhoodId = @neighborhoodId" : "";

        int total;
        await using (var countCmd = connection.CreateCommand())
        {
            countCmd.CommandText = $"SELECT COUNT(*) FROM dbo.Units {whereSql}";
            if (effectiveNeighborhoodId is not null)
            {
                countCmd.Parameters.AddWithValue("@neighborhoodId", effectiveNeighborhoodId.Value);
            }
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
                {whereSql}
                ORDER BY {sortField} {sortDir}
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
            if (effectiveNeighborhoodId is not null)
            {
                cmd.Parameters.AddWithValue("@neighborhoodId", effectiveNeighborhoodId.Value);
            }
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
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

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

        var unit = Read(reader);
        var scope = ResolveNeighborhoodScope(req);
        if (scope.IsScoped && unit.NeighborhoodId != scope.NeighborhoodId)
        {
            // Fuera de la colonia de este Administrador (o sin colonia
            // asignada todavía) -- mismo 404 que si el id no existiera.
            return new NotFoundResult();
        }

        return new OkObjectResult(unit);
    }

    public record CreateUnitBody(string Identifier, bool? Active, int NeighborhoodId, string? Address, decimal? FeeAmount);

    [Function("CreateUnit")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "units")] HttpRequest req)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

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

        // Un Administrador crea la unidad directo en SU colonia -- se
        // ignora lo que haya mandado el body para NeighborhoodId (mismo
        // criterio que un residente puro en Payments.cs: el servidor lo
        // fuerza, no confía en que el frontend ya lo haya ocultado). Sin
        // colonia asignada todavía, no puede crear ninguna unidad.
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
            effectiveNeighborhoodId = body.NeighborhoodId;
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        // Reintenta con un código nuevo si choca con el índice único
        // (UX_Units_RegistrationCode) — con 6 caracteres de un alfabeto de
        // 31 son ~887 millones de combinaciones, así que esto es solo para
        // no romper la creación en el caso remoto de una colisión.
        for (var attempt = 1; ; attempt++)
        {
            var registrationCode = GenerateRegistrationCode();
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO dbo.Units (Identifier, Active, NeighborhoodId, Address, FeeAmount, RegistrationCode)
                OUTPUT INSERTED.UnitId, INSERTED.Identifier, INSERTED.Active, INSERTED.NeighborhoodId, INSERTED.Address, INSERTED.FeeAmount, INSERTED.RegistrationCode
                VALUES (@identifier, @active, @neighborhoodId, @address, @feeAmount, @registrationCode)";
            cmd.Parameters.AddWithValue("@identifier", body.Identifier);
            cmd.Parameters.AddWithValue("@active", body.Active ?? true);
            cmd.Parameters.AddWithValue("@neighborhoodId", effectiveNeighborhoodId);
            cmd.Parameters.AddWithValue("@address", (object?)body.Address ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@feeAmount", (object?)body.FeeAmount ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@registrationCode", registrationCode);

            try
            {
                await using var reader = await cmd.ExecuteReaderAsync();
                await reader.ReadAsync();
                var created = Read(reader);
                return new CreatedResult($"/api/units/{created.Id}", created);
            }
            catch (Microsoft.Data.SqlClient.SqlException ex) when (ex.Number is 2601 or 2627 && attempt < 5)
            {
                _logger.LogWarning(ex, "RegistrationCode collision on attempt {Attempt}, retrying.", attempt);
            }
        }
    }

    public record UpdateUnitBody(string? Identifier, bool? Active, int? NeighborhoodId, string? Address, decimal? FeeAmount);

    [Function("UpdateUnit")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "units/{id:int}")] HttpRequest req, int id)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        var body = await JsonSerializer.DeserializeAsync<UpdateUnitBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        var scope = ResolveNeighborhoodScope(req);
        if (scope.IsScoped)
        {
            var currentNeighborhoodId = await FindUnitNeighborhoodIdAsync(connection, id);
            if (currentNeighborhoodId is null || currentNeighborhoodId != scope.NeighborhoodId)
            {
                // Fuera de la colonia de este Administrador (o sin colonia
                // asignada todavía) -- mismo 404 que si no existiera.
                return new NotFoundResult();
            }
        }

        await using var cmd = connection.CreateCommand();
        // Address y FeeAmount usan asignación directa, no COALESCE como el
        // resto: son campos opcionales (a diferencia de Identifier/Active/
        // NeighborhoodId, que el formulario siempre manda), así que dejarlos
        // en blanco en la edición debe poder borrar el valor guardado — para
        // FeeAmount en particular, eso es lo que hace que la unidad vuelva a
        // usar la cuota general de la colonia. NeighborhoodId, en cambio, se
        // ignora del body por completo cuando quien edita está acotado a una
        // colonia (scope.IsScoped) -- un Administrador no puede mudar una
        // unidad a otra colonia, solo un SuperAdministrador.
        cmd.CommandText = @"
            UPDATE dbo.Units
            SET Identifier = COALESCE(@identifier, Identifier),
                Active = COALESCE(@active, Active),
                NeighborhoodId = COALESCE(@neighborhoodId, NeighborhoodId),
                Address = @address,
                FeeAmount = @feeAmount
            OUTPUT INSERTED.UnitId, INSERTED.Identifier, INSERTED.Active, INSERTED.NeighborhoodId, INSERTED.Address, INSERTED.FeeAmount, INSERTED.RegistrationCode
            WHERE UnitId = @id";
        cmd.Parameters.AddWithValue("@identifier", (object?)body?.Identifier ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@active", (object?)body?.Active ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@neighborhoodId", scope.IsScoped ? DBNull.Value : (object?)body?.NeighborhoodId ?? DBNull.Value);
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

    // Compartido por Update/Delete para chequear el alcance por colonia
    // de un Administrador antes de tocar la fila. Devuelve null si la
    // unidad no existe.
    private static async Task<int?> FindUnitNeighborhoodIdAsync(Microsoft.Data.SqlClient.SqlConnection connection, int unitId)
    {
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT NeighborhoodId FROM dbo.Units WHERE UnitId = @id";
        cmd.Parameters.AddWithValue("@id", unitId);
        var result = await cmd.ExecuteScalarAsync();
        return result is null ? null : (int)result;
    }

    [Function("DeleteUnit")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "units/{id:int}")] HttpRequest req, int id)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        var scope = ResolveNeighborhoodScope(req);
        if (scope.IsScoped)
        {
            var currentNeighborhoodId = await FindUnitNeighborhoodIdAsync(connection, id);
            if (currentNeighborhoodId is null || currentNeighborhoodId != scope.NeighborhoodId)
            {
                return new NotFoundResult();
            }
        }

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
