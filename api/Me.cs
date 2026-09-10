using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace Neighborhood;

// Diagnostic endpoint: by the time this runs, JwtAuthenticationMiddleware
// has already validated the Auth0 token (this function isn't in the
// middleware's public/skip list), so req.HttpContext.User is the
// validated ClaimsPrincipal. AuthorizationLevel.Anonymous here is
// intentional — the JWT check is the real gate, not a function key.
public class Me
{
    private readonly ILogger<Me> _logger;

    public Me(ILogger<Me> logger)
    {
        _logger = logger;
    }

    [Function("Me")]
    public IActionResult Run([HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequest req)
    {
        var user = req.HttpContext.User;

        if (user.Identity?.IsAuthenticated != true)
        {
            _logger.LogWarning("Me called without an authenticated user in HttpContext.");
            return new UnauthorizedObjectResult(new { error = "No authenticated user found." });
        }

        var claims = user.Claims.Select(c => new { c.Type, c.Value });
        return new OkObjectResult(new { authenticated = true, claims });
    }
}
