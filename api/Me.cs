using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Neighborhood.Auth;

namespace Neighborhood;

// Diagnostic endpoint, y ahora también la forma en la que el frontend
// sabe si tiene que mostrar el dashboard o la pantalla de registro
// (ver RegisterResident en Residents.cs y OptionalRegistrationFunctions
// en JwtAuthenticationMiddleware.cs). Por eso Me es una de las dos
// funciones que aceptan un JWT válido sin exigir una fila en Residents:
// un login de Auth0 exitoso pero sin CurrentUser significa "todavía no
// te registraste", no un error.
public class Me
{
    [Function("Me")]
    public IActionResult Run([HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequest req)
    {
        var currentUser = req.HttpContext.GetCurrentUser();
        if (currentUser is null)
        {
            return new OkObjectResult(new { registered = false });
        }

        return new OkObjectResult(new { registered = true, resident = currentUser });
    }
}
