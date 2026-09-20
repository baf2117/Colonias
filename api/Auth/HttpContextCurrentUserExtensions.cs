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
    private const string Auth0SubItemsKey = "Auth0Sub";

    public static void SetCurrentUser(this HttpContext httpContext, CurrentUser user)
        => httpContext.Items[ItemsKey] = user;

    public static CurrentUser? GetCurrentUser(this HttpContext httpContext)
        => httpContext.Items.TryGetValue(ItemsKey, out var value) ? value as CurrentUser : null;

    // El "sub" validado se guarda siempre (incluso sin fila en Residents
    // todavía), para que RegisterResident pueda leerlo sin volver a
    // parsear el ClaimsPrincipal.
    public static void SetAuth0Sub(this HttpContext httpContext, string sub)
        => httpContext.Items[Auth0SubItemsKey] = sub;

    public static string? GetAuth0Sub(this HttpContext httpContext)
        => httpContext.Items.TryGetValue(Auth0SubItemsKey, out var value) ? value as string : null;
}
