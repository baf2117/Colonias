namespace Neighborhood.Auth;

/// <summary>
/// The authenticated user resolved from the Residents table, keyed by
/// the Auth0 "sub" claim of the validated JWT. Populated by
/// JwtAuthenticationMiddleware and read by functions via
/// HttpContext.GetCurrentUser().
///
/// dbo.Users merged into dbo.Residents (see schema.sql): there is no
/// more Users/Residents split, so there's no more UserId/Role either.
/// ResidentId is the merged table's primary key, and the three booleans
/// below replace the old single-value Role. Guardia se eliminó: los
/// guardias ya no son Residents, ver CurrentStaff.
/// </summary>
public class CurrentUser
{
    public required int ResidentId { get; init; }
    public required string Auth0Sub { get; init; }
    public required string Name { get; init; }
    public string? Email { get; init; }
    public int? UnitId { get; init; }
    // Colonia que este usuario administra (dbo.Residents.NeighborhoodId,
    // migración 2026-09-21) -- independiente de UnitId, solo se usa para
    // un Administrador (ver ResolveAdministradorNeighborhoodScope en
    // Units.cs). Null: administrador sin colonia asignada todavía, o
    // simplemente no es administrador.
    public int? NeighborhoodId { get; init; }
    public required bool Administrador { get; init; }
    public required bool SuperAdministrador { get; init; }
    public required bool Residente { get; init; }
}
