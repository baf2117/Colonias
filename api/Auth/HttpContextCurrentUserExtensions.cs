using Microsoft.AspNetCore.Http;

namespace Neighborhood.Auth;

/// <summary>
/// Carries the CurrentUser resolved by JwtAuthenticationMiddleware
/// through HttpContext.Items, so any function can read it without
/// re-querying the database.
/// </summary>
public static class HttpContextCurrentUserExtensions
{
    private const string ItemsKey = "CurrentUser";

    public static void SetCurrentUser(this HttpContext httpContext, CurrentUser user)
        => httpContext.Items[ItemsKey] = user;

    public static CurrentUser? GetCurrentUser(this HttpContext httpContext)
        => httpContext.Items.TryGetValue(ItemsKey, out var value) ? value as CurrentUser : null;
}
