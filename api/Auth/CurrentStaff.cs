namespace Neighborhood.Auth;

/// <summary>
/// The authenticated guard resolved from the SecurityStaff table,
/// keyed by the Auth0 "sub" claim of the validated JWT. Parallel a
/// CurrentUser (que se resuelve contra Residents): un guardia no es un
/// Resident, así que tiene su propio tipo, su propia clave en
/// HttpContext.Items y su propio provider method
/// (CurrentUserProvider.LoadStaffBySubAsync). Populated by
/// JwtAuthenticationMiddleware and read via HttpContext.GetCurrentStaff().
/// </summary>
public class CurrentStaff
{
    public required int StaffId { get; init; }
    public required string Auth0Sub { get; init; }
    public required string Name { get; init; }
    public required int NeighborhoodId { get; init; }
}
