using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Neighborhood.Auth;

namespace Neighborhood;

// Diagnostic endpoint, y ahora también la forma en la que el frontend
// sabe si tiene que mostrar el dashboard o la pantalla de registro
// (ver RegisterResident/RegisterSecurityStaff y OptionalRegistrationFunctions
// en JwtAuthenticationMiddleware.cs). Por eso Me es de las funciones
// que aceptan un JWT válido sin exigir una fila en Residents ni en
// SecurityStaff: un login de Auth0 exitoso pero sin CurrentUser/
// CurrentStaff significa "todavía no te registraste", no un error.
// "kind" le dice al front cuál de las dos identidades encontró, para
// que pueda mostrar el objeto correcto sin tener que adivinar.
public class Me
{
    [Function("Me")]
    public IActionResult Run([HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequest req)
    {
        var currentUser = req.HttpContext.GetCurrentUser();
        if (currentUser is not null)
        {
            return new OkObjectResult(new { registered = true, kind = "resident", resident = currentUser });
        }

        var currentStaff = req.HttpContext.GetCurrentStaff();
        if (currentStaff is not null)
        {
            return new OkObjectResult(new { registered = true, kind = "staff", staff = currentStaff });
        }

        return new OkObjectResult(new { registered = false });
    }
}
