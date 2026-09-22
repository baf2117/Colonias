using Microsoft.Azure.Functions.Worker;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using Neighborhood.Database;
using Neighborhood.Email;

namespace Neighborhood;

// Recordatorio de pago pendiente: un Timer Trigger diario que revisa,
// para el período actual (mes en curso), qué unidades activas no
// tienen ningún pago "activo" (pending o approved, mismo criterio que
// usa Payments.cs para no dejar cargar dos pagos activos del mismo mes)
// y les manda un correo a sus residentes con correo cargado.
//
// dbo.PaymentReminders evita repetir el aviso todos los días para la
// misma unidad+período: se manda una sola vez por mes por unidad, no
// importa cuántas veces corra el timer mientras siga morosa.
//
// No se manda nada los primeros días del mes (PaymentReminderStartDay,
// configurable, default 5): recién empezado el período todavía es
// normal no tener pago cargado.
public class PaymentReminders
{
    private readonly ILogger<PaymentReminders> _logger;

    public PaymentReminders(ILogger<PaymentReminders> logger)
    {
        _logger = logger;
    }

    // Mismo patrón que SpanishMonths en Payments.cs: hardcodeado a
    // propósito, nunca CultureInfo (el runtime de Azure Functions puede
    // no tener esos datos de globalización cargados).
    private static readonly string[] SpanishMonths =
    {
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    };

    private static int StartDay =>
        int.TryParse(Environment.GetEnvironmentVariable("PaymentReminderStartDay"), out var day) ? day : 5;

    // "0 0 9 * * *" = todos los días a las 9:00 (UTC, salvo que el
    // Function App tenga configurado WEBSITE_TIME_ZONE). Corre todos
    // los días -- no solo el día StartDay -- a propósito: cubre una
    // unidad que se puso al día pero cayó en mora otro mes distinto, y
    // una corrida que falló o no llegó a desplegarse a tiempo.
    [Function("PaymentReminders")]
    public async Task Run([TimerTrigger("0 0 9 * * *")] TimerInfo timer)
    {
        var today = DateTime.UtcNow.Date;
        if (today.Day < StartDay)
        {
            return;
        }

        var period = new DateTime(today.Year, today.Month, 1);

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        var candidates = new List<(int UnitId, string Identifier, string Currency, decimal FeeAmount)>();
        await using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = @"
                SELECT U.UnitId, U.Identifier, N.Currency, COALESCE(U.FeeAmount, N.DefaultFeeAmount) AS FeeAmount
                FROM dbo.Units U
                JOIN dbo.Neighborhoods N ON N.NeighborhoodId = U.NeighborhoodId
                WHERE U.Active = 1 AND N.Active = 1
                  AND NOT EXISTS (
                      SELECT 1 FROM dbo.Payments P
                      WHERE P.UnitId = U.UnitId AND P.Period = @period AND P.Status IN ('pending', 'approved')
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM dbo.PaymentReminders R
                      WHERE R.UnitId = U.UnitId AND R.Period = @period
                  )";
            cmd.Parameters.AddWithValue("@period", period);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                candidates.Add((
                    reader.GetInt32(reader.GetOrdinal("UnitId")),
                    reader.GetString(reader.GetOrdinal("Identifier")),
                    reader.GetString(reader.GetOrdinal("Currency")),
                    reader.GetDecimal(reader.GetOrdinal("FeeAmount"))));
            }
        }

        if (candidates.Count == 0)
        {
            return;
        }

        var periodText = $"{SpanishMonths[period.Month - 1]} de {period.Year}";
        var sentUnits = 0;

        foreach (var candidate in candidates)
        {
            var residents = new List<(string Name, string Email)>();
            await using (var cmd = connection.CreateCommand())
            {
                cmd.CommandText = @"
                    SELECT Name, Email FROM dbo.Residents
                    WHERE UnitId = @unitId AND Active = 1 AND Email IS NOT NULL";
                cmd.Parameters.AddWithValue("@unitId", candidate.UnitId);
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    residents.Add((
                        reader.GetString(reader.GetOrdinal("Name")),
                        reader.GetString(reader.GetOrdinal("Email"))));
                }
            }

            if (residents.Count == 0)
            {
                // Nadie a quién avisarle -- igual se marca como enviada
                // para no revisar esta unidad todos los días hasta que
                // alguno de sus residentes cargue un correo.
                await MarkSentAsync(connection, candidate.UnitId, period);
                continue;
            }

            var amountText = $"{candidate.FeeAmount:F2} {candidate.Currency}";
            var subject = $"Recordatorio: cuota de {periodText} pendiente";
            var anySent = false;

            foreach (var resident in residents)
            {
                var htmlContent =
                    $"<p>Hola {resident.Name},</p>" +
                    $"<p>Todavía no registramos tu pago de la cuota de <strong>{candidate.Identifier}</strong> " +
                    $"correspondiente a <strong>{periodText}</strong> (monto de referencia: <strong>{amountText}</strong>).</p>" +
                    "<p>Si ya pagaste, cargá el comprobante desde el sistema para que quede registrado.</p>";

                try
                {
                    var result = await EmailService.SendAsync(resident.Email, resident.Name, subject, htmlContent);
                    if (result.Success)
                    {
                        anySent = true;
                    }
                    else
                    {
                        _logger.LogWarning(
                            "No se pudo enviar el recordatorio de pago a {Email} (unidad {UnitId}): {StatusCode} {Body}",
                            resident.Email, candidate.UnitId, result.StatusCode, result.ResponseBody);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error al enviar el recordatorio de pago a {Email} (unidad {UnitId})", resident.Email, candidate.UnitId);
                }
            }

            if (anySent)
            {
                await MarkSentAsync(connection, candidate.UnitId, period);
                sentUnits++;
            }
        }

        _logger.LogInformation(
            "Recordatorios de pago: {SentUnits} de {Candidates} unidades avisadas para {Period}",
            sentUnits, candidates.Count, period);
    }

    private static async Task MarkSentAsync(SqlConnection connection, int unitId, DateTime period)
    {
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "INSERT INTO dbo.PaymentReminders (UnitId, Period) VALUES (@unitId, @period)";
        cmd.Parameters.AddWithValue("@unitId", unitId);
        cmd.Parameters.AddWithValue("@period", period);
        await cmd.ExecuteNonQueryAsync();
    }
}
