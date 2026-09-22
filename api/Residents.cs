using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Neighborhood.Auth;
using Neighborhood.Database;

namespace Neighborhood;

// CRUD de residentes (dbo.Residents), calcado del patrón de Units.cs /
// Vendors.cs. dbo.Residents es la fusión de lo que antes eran dbo.Users
// y dbo.Residents (ver schema.sql): en vez de un Role de texto único,
// tres columnas booleanas independientes y combinables (Administrador,
// SuperAdministrador, Residente). UnitId es opcional — un administrador
// "puro" no vive en ninguna unidad. No se guarda ninguna relación tipo
// propietario/inquilino con la unidad. Los guardias NO son Residents:
// viven en dbo.SecurityStaff (ver SecurityStaff.cs).
//
// Auth0Sub no se expone en Create/Update a propósito: no es algo que el
// formulario de alta/edición del dashboard deba poder tocar a mano. Sí
// viaja en el DTO de lectura (GetList/GetOne) para que el dashboard
// pueda mostrar si la cuenta ya está vinculada. La única forma de
// setearlo es RegisterResident (más abajo), que lo toma del JWT
// validado, nunca del body — así nadie puede vincularse a un Auth0Sub
// ajeno.
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
        int? NeighborhoodId,
        bool Administrador,
        bool SuperAdministrador,
        bool Residente,
        bool Active,
        string? Auth0Sub);

    private const string SelectColumns =
        "ResidentId, Name, Phone, Email, UnitId, NeighborhoodId, Administrador, SuperAdministrador, Residente, Active, Auth0Sub";

    private static ResidentDto Read(Microsoft.Data.SqlClient.SqlDataReader reader) => new(
        reader.GetInt32(reader.GetOrdinal("ResidentId")),
        reader.GetString(reader.GetOrdinal("Name")),
        reader.IsDBNull(reader.GetOrdinal("Phone")) ? null : reader.GetString(reader.GetOrdinal("Phone")),
        reader.IsDBNull(reader.GetOrdinal("Email")) ? null : reader.GetString(reader.GetOrdinal("Email")),
        reader.IsDBNull(reader.GetOrdinal("UnitId")) ? null : reader.GetInt32(reader.GetOrdinal("UnitId")),
        reader.IsDBNull(reader.GetOrdinal("NeighborhoodId")) ? null : reader.GetInt32(reader.GetOrdinal("NeighborhoodId")),
        reader.GetBoolean(reader.GetOrdinal("Administrador")),
        reader.GetBoolean(reader.GetOrdinal("SuperAdministrador")),
        reader.GetBoolean(reader.GetOrdinal("Residente")),
        reader.GetBoolean(reader.GetOrdinal("Active")),
        reader.IsDBNull(reader.GetOrdinal("Auth0Sub")) ? null : reader.GetString(reader.GetOrdinal("Auth0Sub")));

    // A diferencia de Neighborhoods (donde GetList/GetOne quedan abiertos
    // porque cualquier rol necesita el selector de colonia y la moneda),
    // acá el usuario pidió explícitamente que el directorio completo
    // -listar, ver, crear, editar, borrar- sea solo para Administrador o
    // SuperAdministrador. Eso significa que UnitShow (sección de
    // residentes de una unidad) y PaymentShow/PaymentList (nombre del
    // residente que pagó) van a mostrar esos campos vacíos para
    // guardias/residentes, que es la consecuencia esperada de un pedido
    // de privacidad y no un caso a mitigar. RegisterResident (el
    // auto-registro) queda deliberadamente afuera de este check: lo usa
    // cualquier usuario de Auth0 que todavía no tiene fila en Residents.
    private static IActionResult? RequireAdminOrSuperAdmin(HttpRequest req)
    {
        var currentUser = req.HttpContext.GetCurrentUser();
        if (currentUser is null || !(currentUser.Administrador || currentUser.SuperAdministrador))
        {
            return new ObjectResult(new
            {
                error = "Solo un administrador puede acceder al directorio de residentes.",
                message = "Solo un administrador puede acceder al directorio de residentes.",
            })
            { StatusCode = StatusCodes.Status403Forbidden };
        }
        return null;
    }

    private static IActionResult Forbidden(string message) =>
        new ObjectResult(new { error = message, message }) { StatusCode = StatusCodes.Status403Forbidden };

    // Mensaje deliberadamente genérico (nunca dice "es superadministrador"
    // ni "es administrador") -- el motivo real de un 403 acá no debe
    // filtrarle a un Administrador el rol exacto de alguien que, si es
    // SuperAdministrador, ni siquiera debería poder ver en el directorio
    // (ver MaskSuperAdministrador más abajo).
    private const string CannotEditMessage = "No tenés permiso para editar este residente.";

    // Reglas de edición de dbo.Residents, en orden:
    //  1. Cualquiera puede editar su propia ficha (currentUser.ResidentId).
    //  2. Nadie -- ni siquiera otro SuperAdministrador -- puede editar la
    //     ficha de un SuperAdministrador que no sea uno mismo. El único
    //     que puede tocar los datos de un SuperAdministrador es él mismo.
    //  3. Un Administrador (sin SuperAdministrador) tampoco puede editar
    //     a OTRO Administrador. Un SuperAdministrador sí puede.
    // Devuelve null si no existe la fila -- que el UPDATE de más abajo
    // devuelva el 404 de siempre.
    private static async Task<IActionResult?> RequireCanEditResidentAsync(
        HttpRequest req, Microsoft.Data.SqlClient.SqlConnection connection, int targetId)
    {
        var currentUser = req.HttpContext.GetCurrentUser();
        if (currentUser is null)
        {
            return Forbidden(CannotEditMessage);
        }
        if (currentUser.ResidentId == targetId)
        {
            return null;
        }

        bool targetAdministrador, targetSuperAdministrador;
        await using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = "SELECT Administrador, SuperAdministrador FROM dbo.Residents WHERE ResidentId = @id";
            cmd.Parameters.AddWithValue("@id", targetId);
            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                return null;
            }
            targetAdministrador = reader.GetBoolean(reader.GetOrdinal("Administrador"));
            targetSuperAdministrador = reader.GetBoolean(reader.GetOrdinal("SuperAdministrador"));
        }

        if (targetSuperAdministrador)
        {
            return Forbidden(CannotEditMessage);
        }
        if (targetAdministrador && !currentUser.SuperAdministrador)
        {
            return Forbidden(CannotEditMessage);
        }

        return null;
    }

    // Solo un SuperAdministrador puede dejar a alguien (a sí mismo
    // incluido) como SuperAdministrador -- un Administrador nunca puede
    // otorgar ese rol, ni siquiera de forma indirecta editando su propia
    // ficha. `requestedSuperAdministrador` es el valor que vino en el
    // body (null = el campo no vino, no hay nada que validar).
    private static IActionResult? RequireCanGrantSuperAdministrador(HttpRequest req, bool? requestedSuperAdministrador)
    {
        if (requestedSuperAdministrador is not true)
        {
            return null;
        }
        var currentUser = req.HttpContext.GetCurrentUser();
        if (currentUser is null || !currentUser.SuperAdministrador)
        {
            return Forbidden("Solo un superadministrador puede asignar el rol de superadministrador.");
        }
        return null;
    }

    // Solo un SuperAdministrador puede asignarle una colonia a alguien
    // (dbo.Residents.NeighborhoodId, la colonia que un Administrador
    // administra -- ver schema.sql) -- un Administrador no puede
    // autoasignarse una ni reasignar la de otro. Mismo criterio y misma
    // forma que RequireCanGrantSuperAdministrador: solo valida cuando el
    // body realmente trae un valor (null = no vino, no hay nada que
    // asignar todavía, así que no hay nada que validar). El Update usa
    // COALESCE para este campo (como Administrador/SuperAdministrador,
    // no como Phone/UnitId) justamente para que esto sea seguro: un
    // Administrador editando cualquier otro campo de SU PROPIA ficha
    // nunca manda este campo, así que nunca lo borra sin querer.
    private static IActionResult? RequireCanAssignNeighborhood(HttpRequest req, int? requestedNeighborhoodId)
    {
        if (requestedNeighborhoodId is null)
        {
            return null;
        }
        var currentUser = req.HttpContext.GetCurrentUser();
        if (currentUser is null || !currentUser.SuperAdministrador)
        {
            return Forbidden("Solo un superadministrador puede asignarle una colonia a un administrador.");
        }
        return null;
    }

    // Un Administrador (sin SuperAdministrador) no debe enterarse de que
    // otra persona es SuperAdministrador -- a pedido explícito del
    // usuario, ni siquiera de que esa fila existe. No alcanza con
    // devolver el campo en false (eso ya se probó y el registro seguía
    // apareciendo en el directorio): la fila entera de un
    // SuperAdministrador se excluye de GetResidents, y GetResident
    // devuelve 404 para su id, como si no existiera. No hace falta
    // ocultar a un Administrador que no sea SuperAdministrador: solo
    // SuperAdministrador es sensible acá.
    private static bool IsAdminOnly(CurrentUser? currentUser) =>
        currentUser is { SuperAdministrador: false, Administrador: true };

    [Function("GetResidents")]
    public async Task<IActionResult> GetList(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "residents")] HttpRequest req)
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
                    "administrador" => "Administrador",
                    "superAdministrador" => "SuperAdministrador",
                    "residente" => "Residente",
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

        // Un Administrador (sin SuperAdministrador) ni siquiera ve la fila
        // de un SuperAdministrador en este listado -- ver IsAdminOnly.
        // Entra al WHERE (no es un filtro que se pueda sacar por query
        // string) para que Content-Range/total también den bien: contar
        // filas que después no se devuelven rompería la paginación.
        var currentUser = req.HttpContext.GetCurrentUser();
        var hideSuperAdministrador = IsAdminOnly(currentUser);

        var whereClauses = new List<string>();
        if (!string.IsNullOrWhiteSpace(nameFilter))
        {
            whereClauses.Add("Name LIKE @nameFilter");
        }
        if (unitIdFilter is not null)
        {
            whereClauses.Add("UnitId = @unitId");
        }
        if (hideSuperAdministrador)
        {
            whereClauses.Add("SuperAdministrador = 0");
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
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

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

        var resident = Read(reader);
        if (resident.SuperAdministrador && IsAdminOnly(req.HttpContext.GetCurrentUser()))
        {
            // Ver IsAdminOnly: para un Administrador, un SuperAdministrador
            // no existe -- mismo 404 que si el id no estuviera en la base.
            return new NotFoundResult();
        }

        return new OkObjectResult(resident);
    }

    public record CreateResidentBody(
        string Name,
        string? Phone,
        string? Email,
        int? UnitId,
        int? NeighborhoodId,
        bool? Administrador,
        bool? SuperAdministrador,
        bool? Residente,
        bool? Active);

    [Function("CreateResident")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "residents")] HttpRequest req)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        var body = await JsonSerializer.DeserializeAsync<CreateResidentBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body is null || string.IsNullOrWhiteSpace(body.Name))
        {
            return new BadRequestObjectResult(new { error = "Name is required." });
        }

        var grantForbidden = RequireCanGrantSuperAdministrador(req, body.SuperAdministrador);
        if (grantForbidden is not null)
        {
            return grantForbidden;
        }

        var assignForbidden = RequireCanAssignNeighborhood(req, body.NeighborhoodId);
        if (assignForbidden is not null)
        {
            return assignForbidden;
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO dbo.Residents
                (Name, Phone, Email, UnitId, NeighborhoodId, Administrador, SuperAdministrador, Residente, Active)
            OUTPUT
                INSERTED.ResidentId, INSERTED.Name, INSERTED.Phone, INSERTED.Email, INSERTED.UnitId, INSERTED.NeighborhoodId,
                INSERTED.Administrador, INSERTED.SuperAdministrador,
                INSERTED.Residente, INSERTED.Active, INSERTED.Auth0Sub
            VALUES
                (@name, @phone, @email, @unitId, @neighborhoodId, @administrador, @superAdministrador, @residente, @active)";
        cmd.Parameters.AddWithValue("@name", body.Name);
        cmd.Parameters.AddWithValue("@phone", (object?)body.Phone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email", (object?)body.Email ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@unitId", (object?)body.UnitId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@neighborhoodId", (object?)body.NeighborhoodId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@administrador", body.Administrador ?? false);
        cmd.Parameters.AddWithValue("@superAdministrador", body.SuperAdministrador ?? false);
        cmd.Parameters.AddWithValue("@residente", body.Residente ?? false);
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
        int? NeighborhoodId,
        bool? Administrador,
        bool? SuperAdministrador,
        bool? Residente,
        bool? Active);

    [Function("UpdateResident")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "residents/{id:int}")] HttpRequest req, int id)
    {
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

        var body = await JsonSerializer.DeserializeAsync<UpdateResidentBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        var grantForbidden = RequireCanGrantSuperAdministrador(req, body?.SuperAdministrador);
        if (grantForbidden is not null)
        {
            return grantForbidden;
        }

        var assignForbidden = RequireCanAssignNeighborhood(req, body?.NeighborhoodId);
        if (assignForbidden is not null)
        {
            return assignForbidden;
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        var editForbidden = await RequireCanEditResidentAsync(req, connection, id);
        if (editForbidden is not null)
        {
            return editForbidden;
        }

        await using var cmd = connection.CreateCommand();
        // Phone/Email/UnitId usan asignación directa, no COALESCE: son
        // opcionales, así que dejarlos en blanco en la edición debe poder
        // borrar el valor guardado (igual que Address en UpdateUnit) —
        // para UnitId en particular, eso es lo que permite pasar a
        // alguien de "vive en una unidad" a "cuenta sin unidad" (o
        // viceversa). NeighborhoodId es la excepción: va con COALESCE,
        // no asignación directa -- a propósito, porque el formulario ni
        // siquiera renderiza este campo para quien no puede tocarlo (ver
        // ResidentEdit.tsx), así que ese PUT nunca lo manda. Con
        // asignación directa, ese "no lo manda" se leería como "bórralo",
        // y cualquier Administrador que edite su propia ficha (nombre,
        // teléfono, lo que sea) le borraría la colonia asignada sin
        // querer en cada guardado.
        cmd.CommandText = @"
            UPDATE dbo.Residents
            SET Name = COALESCE(@name, Name),
                Phone = @phone,
                Email = @email,
                UnitId = @unitId,
                NeighborhoodId = COALESCE(@neighborhoodId, NeighborhoodId),
                Administrador = COALESCE(@administrador, Administrador),
                SuperAdministrador = COALESCE(@superAdministrador, SuperAdministrador),
                Residente = COALESCE(@residente, Residente),
                Active = COALESCE(@active, Active)
            OUTPUT
                INSERTED.ResidentId, INSERTED.Name, INSERTED.Phone, INSERTED.Email, INSERTED.UnitId, INSERTED.NeighborhoodId,
                INSERTED.Administrador, INSERTED.SuperAdministrador,
                INSERTED.Residente, INSERTED.Active, INSERTED.Auth0Sub
            WHERE ResidentId = @id";
        cmd.Parameters.AddWithValue("@name", (object?)body?.Name ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@phone", (object?)body?.Phone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email", (object?)body?.Email ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@unitId", (object?)body?.UnitId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@neighborhoodId", (object?)body?.NeighborhoodId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@administrador", (object?)body?.Administrador ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@superAdministrador", (object?)body?.SuperAdministrador ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@residente", (object?)body?.Residente ?? DBNull.Value);
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
        var forbidden = RequireAdminOrSuperAdmin(req);
        if (forbidden is not null)
        {
            return forbidden;
        }

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

    public record RegisterResidentBody(string Code, string Name, string? Email, string? Phone);

    // Auto-registro: lo llama alguien que ya inició sesión con Auth0 pero
    // todavía no tiene fila en Residents (ver OptionalRegistrationFunctions
    // en JwtAuthenticationMiddleware.cs, que deja pasar esta función sin
    // exigir esa fila). En vez de elegir su unidad de una lista, entra el
    // código que le dio el administrador de su colonia
    // (Units.RegistrationCode) — así no hace falta exponerle el listado
    // completo de unidades a alguien que todavía no es residente de
    // ninguna. El residente creado queda con Residente = true y sin los
    // otros dos roles: son cosas que solo un administrador asigna a mano
    // desde ResidentEdit.
    [Function("RegisterResident")]
    public async Task<IActionResult> Register(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "residents/register")] HttpRequest req)
    {
        var sub = req.HttpContext.GetAuth0Sub();
        if (string.IsNullOrEmpty(sub))
        {
            // No debería pasar: si llegamos hasta acá, el middleware ya
            // validó el JWT y guardó el sub.
            return new UnauthorizedResult();
        }

        var body = await JsonSerializer.DeserializeAsync<RegisterResidentBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body is null || string.IsNullOrWhiteSpace(body.Code))
        {
            return new BadRequestObjectResult(new { error = "El código de la unidad es obligatorio." });
        }
        if (string.IsNullOrWhiteSpace(body.Name))
        {
            return new BadRequestObjectResult(new { error = "El nombre es obligatorio." });
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        int unitId;
        await using (var lookupCmd = connection.CreateCommand())
        {
            lookupCmd.CommandText = "SELECT UnitId FROM dbo.Units WHERE RegistrationCode = @code";
            lookupCmd.Parameters.AddWithValue("@code", body.Code.Trim());
            var result = await lookupCmd.ExecuteScalarAsync();
            if (result is null)
            {
                return new BadRequestObjectResult(new { error = "Código inválido. Verifica con el administrador de tu colonia." });
            }
            unitId = (int)result;
        }

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO dbo.Residents (Name, Phone, Email, UnitId, Auth0Sub, Residente, Active)
            OUTPUT
                INSERTED.ResidentId, INSERTED.Name, INSERTED.Phone, INSERTED.Email, INSERTED.UnitId, INSERTED.NeighborhoodId,
                INSERTED.Administrador, INSERTED.SuperAdministrador, INSERTED.Residente,
                INSERTED.Active, INSERTED.Auth0Sub
            VALUES (@name, @phone, @email, @unitId, @sub, 1, 1)";
        cmd.Parameters.AddWithValue("@name", body.Name.Trim());
        cmd.Parameters.AddWithValue("@phone", (object?)body.Phone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email", (object?)body.Email ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@unitId", unitId);
        cmd.Parameters.AddWithValue("@sub", sub);

        try
        {
            await using var reader = await cmd.ExecuteReaderAsync();
            await reader.ReadAsync();
            var created = Read(reader);
            return new CreatedResult($"/api/residents/{created.Id}", created);
        }
        catch (Microsoft.Data.SqlClient.SqlException ex) when (ex.Number is 2601 or 2627)
        {
            // UX_Residents_Auth0Sub: esta cuenta de Auth0 ya tiene una fila
            // en Residents (probablemente desactivada). No puede
            // auto-registrarse de nuevo; que lo resuelva el administrador.
            _logger.LogWarning(ex, "RegisterResident blocked: Auth0Sub {Sub} already has a Residents row.", sub);
            return new ConflictObjectResult(new { error = "Ya existe una cuenta registrada con este inicio de sesión. Contacta al administrador." });
        }
    }
}
