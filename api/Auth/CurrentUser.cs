namespace Neighborhood.Auth;

/// <summary>
/// The authenticated user resolved from the Users table, keyed by the
/// Auth0 "sub" claim of the validated JWT. Populated by
/// JwtAuthenticationMiddleware and read by functions via
/// HttpContext.GetCurrentUser().
/// </summary>
public class CurrentUser
{
    public required int UserId { get; init; }
    public required string Auth0Sub { get; init; }
    public required string Role { get; init; }
    public required string Name { get; init; }
    public string? Email { get; init; }
    public int? ResidentId { get; init; }
    public int? UnitId { get; init; }
}
