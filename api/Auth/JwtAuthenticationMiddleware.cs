using System.Net;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Middleware;
using Microsoft.Extensions.Logging;

namespace Neighborhood.Auth;

/// <summary>
/// Validates the Auth0 JWT on every HTTP-triggered function, except the
/// diagnostic ones listed in PublicFunctions (used before Auth0 is fully
/// wired up). Non-HTTP triggers (e.g. a Timer trigger) pass through
/// untouched. On success, the validated ClaimsPrincipal is attached to
/// HttpContext.User for the function to read.
/// </summary>
public class JwtAuthenticationMiddleware : IFunctionsWorkerMiddleware
{
    private static readonly HashSet<string> PublicFunctions = new(StringComparer.OrdinalIgnoreCase)
    {
        "Ping",
        "DbPing",
    };

    // Estas funciones exigen un JWT de Auth0 válido (una persona real
    // autenticada), pero no una fila activa en Residents ni en
    // SecurityStaff todavía: es exactamente el caso de alguien que
    // acaba de loguearse por primera vez y todavía no se registró. Me
    // le dice al front si ya está registrado (y como qué);
    // RegisterResident y RegisterSecurityStaff son los endpoints que
    // crean esa fila (ver Residents.cs y SecurityStaff.cs).
    private static readonly HashSet<string> OptionalRegistrationFunctions = new(StringComparer.OrdinalIgnoreCase)
    {
        "Me",
        "RegisterResident",
        "RegisterSecurityStaff",
    };

    private readonly Auth0TokenValidator _validator;
    private readonly CurrentUserProvider _userProvider;
    private readonly ILogger<JwtAuthenticationMiddleware> _logger;

    public JwtAuthenticationMiddleware(Auth0TokenValidator validator, CurrentUserProvider userProvider, ILogger<JwtAuthenticationMiddleware> logger)
    {
        _validator = validator;
        _userProvider = userProvider;
        _logger = logger;
    }

    public async Task Invoke(FunctionContext context, FunctionExecutionDelegate next)
    {
        if (PublicFunctions.Contains(context.FunctionDefinition.Name))
        {
            await next(context);
            return;
        }

        var httpContext = context.GetHttpContext();
        if (httpContext is null)
        {
            await next(context);
            return;
        }

        var authHeader = httpContext.Request.Headers.Authorization.ToString();
        if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            httpContext.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            await httpContext.Response.WriteAsJsonAsync(new { error = "Missing bearer token." });
            return;
        }

        var token = authHeader["Bearer ".Length..].Trim();

        ClaimsPrincipal principal;
        try
        {
            principal = await _validator.ValidateAsync(token, context.CancellationToken);
            httpContext.User = principal;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "JWT validation failed.");
            httpContext.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            await httpContext.Response.WriteAsJsonAsync(new { error = "Invalid token." });
            return;
        }

        // Auth0's "sub" claim usually arrives mapped to ClaimTypes.NameIdentifier,
        // but fall back to the raw claim name in case inbound-claim mapping is off.
        var sub = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? principal.FindFirst("sub")?.Value;

        if (string.IsNullOrEmpty(sub))
        {
            _logger.LogWarning("Validated token has no 'sub' claim.");
            httpContext.Response.StatusCode = (int)HttpStatusCode.Forbidden;
            await httpContext.Response.WriteAsJsonAsync(new { error = "Token has no subject." });
            return;
        }

        httpContext.SetAuth0Sub(sub);

        // Un "sub" válido puede corresponder a un Resident o a un
        // guardia (SecurityStaff) — son identidades separadas, se
        // intenta primero Residents y, si no hay match, SecurityStaff.
        var currentUser = await _userProvider.LoadBySubAsync(sub, context.CancellationToken);
        if (currentUser is not null)
        {
            httpContext.SetCurrentUser(currentUser);
        }
        else
        {
            var currentStaff = await _userProvider.LoadStaffBySubAsync(sub, context.CancellationToken);
            if (currentStaff is not null)
            {
                httpContext.SetCurrentStaff(currentStaff);
            }
            else if (!OptionalRegistrationFunctions.Contains(context.FunctionDefinition.Name))
            {
                _logger.LogWarning("No active Residents/SecurityStaff record for Auth0 subject {Sub}.", sub);
                httpContext.Response.StatusCode = (int)HttpStatusCode.Forbidden;
                await httpContext.Response.WriteAsJsonAsync(new { error = "This account is not registered in the system." });
                return;
            }
        }

        await next(context);
    }
}
