using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Neighborhood.Email;

public record EmailSendResult(bool Success, int StatusCode, string ResponseBody);

public record EmailAttachment(string Name, byte[] Content);

/// <summary>
/// Envío de correo transaccional vía Brevo (antes Sendinblue): un POST
/// directo a su API REST (https://api.brevo.com/v3/smtp/email), sin el
/// SDK oficial de Brevo para .NET -- es un único endpoint HTTP simple,
/// no hace falta una dependencia extra para eso. Mismo criterio que
/// BlobStorageService.cs: un solo punto de entrada que lee su propia
/// configuración de variables de entorno, para que el resto del código
/// no tenga que saber nada del formato de request de Brevo.
/// </summary>
public static class EmailService
{
    // HttpClient reutilizable a propósito (nunca "new HttpClient()" por
    // llamada): es la recomendación estándar de .NET para evitar
    // agotar los sockets disponibles bajo carga.
    private static readonly HttpClient HttpClient = new() { BaseAddress = new Uri("https://api.brevo.com/") };

    private static string ApiKey =>
        Environment.GetEnvironmentVariable("BrevoApiKey")
            ?? throw new InvalidOperationException(
                "Missing 'BrevoApiKey' app setting. Add it to local.settings.json for local development.");

    private static string SenderEmail =>
        Environment.GetEnvironmentVariable("BrevoSenderEmail")
            ?? throw new InvalidOperationException(
                "Missing 'BrevoSenderEmail' app setting. Add it to local.settings.json for local development. Tiene que ser un remitente ya verificado en Brevo.");

    private static string SenderName =>
        Environment.GetEnvironmentVariable("BrevoSenderName") ?? "Administración de la colonia";

    /// <summary>
    /// Manda un correo HTML simple a un solo destinatario. No lanza si
    /// Brevo devuelve un error -- el llamador decide qué hacer (loguear
    /// y seguir, típicamente: un correo que falla no debe tumbar la
    /// operación que lo disparó) mirando el resultado.
    /// </summary>
    public static async Task<EmailSendResult> SendAsync(
        string toEmail, string? toName, string subject, string htmlContent, IReadOnlyList<EmailAttachment>? attachments = null)
    {
        var payload = new Dictionary<string, object?>
        {
            ["sender"] = new { email = SenderEmail, name = SenderName },
            ["to"] = new[] { new { email = toEmail, name = toName } },
            ["subject"] = subject,
            ["htmlContent"] = htmlContent,
        };
        // Brevo recibe los adjuntos en base64 dentro del mismo JSON; el
        // nombre tiene que tener una extensión que Brevo acepte (pdf, jpg,
        // png, etc.).
        if (attachments is { Count: > 0 })
        {
            payload["attachment"] = attachments
                .Select(a => new { name = a.Name, content = Convert.ToBase64String(a.Content) })
                .ToArray();
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, "v3/smtp/email")
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"),
        };
        request.Headers.TryAddWithoutValidation("api-key", ApiKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await HttpClient.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        return new EmailSendResult(response.IsSuccessStatusCode, (int)response.StatusCode, body);
    }
}
