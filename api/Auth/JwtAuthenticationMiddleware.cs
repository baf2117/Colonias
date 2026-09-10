using System.Net;
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

    private readonly Auth0TokenValidator _validator;
    private readonly ILogger<JwtAuthenticationMiddleware> _logger;

    public JwtAuthenticationMiddleware(Auth0TokenValidator validator, ILogger<JwtAuthenticationMiddleware> logger)
    {
        _validator = validator;
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

        try
        {
            var principal = await _validator.ValidateAsync(token, context.CancellationToken);
            httpContext.User = principal;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "JWT validation failed.");
            httpContext.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            await httpContext.Response.WriteAsJsonAsync(new { error = "Invalid token." });
            return;
        }

        await next(context);
    }
}
