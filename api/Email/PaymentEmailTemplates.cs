namespace Neighborhood.Email;

/// <summary>
/// Plantillas HTML de los correos de Pagos. Separado de Payments.cs para
/// que ese archivo no cargue con el markup del correo -- cada método
/// arma un mensaje completo (envoltorio + contenido), no fragmentos que
/// haya que ensamblar afuera. HTML con estilos inline y layout de
/// tablas a propósito: es lo único que se renderiza de forma
/// consistente entre clientes de correo (Gmail, Outlook, etc.), un
/// `<style>` en el `<head>` o CSS moderno (flex/grid) no es confiable
/// ahí. La tipografía Sora del resto del sistema se pide igual (mejora
/// progresiva en los clientes que la carguen) pero con una pila de
/// fallback bien de sistema, porque la mayoría de clientes de correo no
/// carga fuentes web externas.
/// </summary>
public static class PaymentEmailTemplates
{
    // Mismos tonos que la paleta "Modernist" de web/src/theme.ts
    // (red.base / green.light) -- si esa paleta cambia, actualizar acá
    // también a mano; no hay forma de compartir la constante entre el
    // frontend (TS) y el correo (HTML de un backend en C#).
    internal const string AccentColor = "#ec3013";
    internal const string ApprovedColor = "#2f6f4a";
    internal const string RejectedColor = "#ae1800"; // red[700] de theme.ts: "texto sobre fondo claro"
    internal const string TextColor = "#201e1d";
    internal const string MutedTextColor = "#7d7979";
    internal const string BackgroundColor = "#f8f4f4";
    internal const string CardBackgroundColor = "#ffffff";
    internal const string BorderColor = "#eae7e7";

    /// <summary>
    /// Envoltorio común a todos los correos (Pagos y Estado de cuentas):
    /// fondo, tarjeta centrada de 600px, barra superior de acento, título
    /// de la colonia y pie de página. `bodyHtml` es el contenido
    /// específico de cada correo (ya con sus propios `<p>`/tablas).
    /// </summary>
    internal static string Layout(string neighborhoodName, string preheader, string bodyHtml) => $@"
<!DOCTYPE html>
<html lang=""es"">
<head>
<meta charset=""utf-8"">
<meta name=""viewport"" content=""width=device-width, initial-scale=1"">
<title>{neighborhoodName}</title>
</head>
<body style=""margin:0; padding:0; background-color:{BackgroundColor}; font-family:'Sora', Helvetica, Arial, sans-serif;"">
  <!-- Preheader: texto de preview en la bandeja de entrada, oculto en el cuerpo del correo -->
  <div style=""display:none; max-height:0; overflow:hidden; opacity:0;"">{preheader}</div>

  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background-color:{BackgroundColor};"">
    <tr>
      <td align=""center"" style=""padding:32px 16px;"">
        <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""max-width:600px; background-color:{CardBackgroundColor};"">
          <tr>
            <td style=""height:4px; background-color:{AccentColor}; line-height:4px; font-size:4px;"">&nbsp;</td>
          </tr>
          <tr>
            <td style=""padding:28px 32px 0 32px;"">
              <p style=""margin:0; font-size:13px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:{MutedTextColor};"">
                {neighborhoodName}
              </p>
            </td>
          </tr>
          <tr>
            <td style=""padding:16px 32px 32px 32px; font-size:15px; line-height:1.6; color:{TextColor};"">
              {bodyHtml}
            </td>
          </tr>
          <tr>
            <td style=""padding:20px 32px; border-top:2px solid {BorderColor};"">
              <p style=""margin:0; font-size:12px; line-height:1.5; color:{MutedTextColor};"">
                Este es un correo automático de la administración de {neighborhoodName}. No respondas a este mensaje.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>";

    // Chip de estado, mismo criterio visual que PaymentStatusField.tsx
    // (verde real solo para "approved", el resto de la paleta se queda
    // en el rojo/neutro único del sistema).
    private static string StatusBadge(string label, string color) => $@"
<span style=""display:inline-block; padding:4px 12px; border-radius:2px; background-color:{color}; color:#ffffff; font-size:12px; font-weight:600; letter-spacing:0.03em; text-transform:uppercase;"">
  {label}
</span>";

    /// <summary>
    /// Correo de "cuota aprobada". <paramref name="residentName"/>,
    /// <paramref name="unitIdentifier"/> y <paramref name="neighborhoodName"/>
    /// van sin escapar -- ya vienen de dbo.Residents/dbo.Units/dbo.Neighborhoods,
    /// no de un formulario público, mismo criterio que el resto de los
    /// correos armados a mano en Payments.cs.
    /// </summary>
    public static string PaymentApproved(string residentName, string unitIdentifier, string neighborhoodName, string period, string amountText)
    {
        var body = $@"
<p style=""margin:0 0 20px 0;"">{StatusBadge("Cuota aprobada", ApprovedColor)}</p>

<p style=""margin:0 0 16px 0;"">Hola <strong>{residentName}</strong>,</p>

<p style=""margin:0 0 24px 0;"">
  Confirmamos que tu pago de la cuota de <strong>{unitIdentifier}</strong> correspondiente a
  <strong>{period}</strong> fue revisado y quedó <strong style=""color:{ApprovedColor};"">aprobado</strong>.
</p>

<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background-color:{BackgroundColor}; margin-bottom:24px;"">
  <tr>
    <td style=""padding:18px 20px;"">
      <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"">
        <tr>
          <td style=""font-size:13px; color:{MutedTextColor}; padding-bottom:4px;"">Unidad</td>
          <td align=""right"" style=""font-size:13px; color:{MutedTextColor}; padding-bottom:4px;"">Período</td>
        </tr>
        <tr>
          <td style=""font-size:16px; font-weight:600;"">{unitIdentifier}</td>
          <td align=""right"" style=""font-size:16px; font-weight:600;"">{period}</td>
        </tr>
        <tr>
          <td colspan=""2"" style=""padding-top:16px; border-top:1px solid {BorderColor}; padding-bottom:4px; padding-top:16px;"">
            <span style=""font-size:13px; color:{MutedTextColor};"">Monto pagado</span>
          </td>
        </tr>
        <tr>
          <td colspan=""2"" style=""font-size:22px; font-weight:700;"">{amountText}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<p style=""margin:0; color:{MutedTextColor};"">
  No hace falta que hagas nada más por este mes. Podés ver el historial completo de tus pagos desde el sistema cuando quieras.
</p>";

        return Layout(neighborhoodName, $"Tu cuota de {period} fue aprobada", body);
    }

    /// <summary>
    /// Correo de "cuota rechazada". <paramref name="rejectionReason"/> es
    /// opcional -- si no vino motivo, se omite el bloque entero en vez de
    /// mostrarlo vacío. Mismos parámetros sin escapar que
    /// <see cref="PaymentApproved"/>, mismo criterio.
    /// </summary>
    public static string PaymentRejected(string residentName, string unitIdentifier, string neighborhoodName, string period, string? rejectionReason)
    {
        var reasonBlock = string.IsNullOrWhiteSpace(rejectionReason) ? "" : $@"
<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background-color:{BackgroundColor}; margin-bottom:24px;"">
  <tr>
    <td style=""padding:18px 20px;"">
      <span style=""display:block; font-size:13px; color:{MutedTextColor}; margin-bottom:6px;"">Motivo</span>
      <span style=""font-size:15px; font-weight:600;"">{rejectionReason}</span>
    </td>
  </tr>
</table>";

        var body = $@"
<p style=""margin:0 0 20px 0;"">{StatusBadge("Cuota rechazada", RejectedColor)}</p>

<p style=""margin:0 0 16px 0;"">Hola <strong>{residentName}</strong>,</p>

<p style=""margin:0 0 24px 0;"">
  Revisamos tu comprobante de la cuota de <strong>{unitIdentifier}</strong> correspondiente a
  <strong>{period}</strong> y quedó <strong style=""color:{RejectedColor};"">rechazado</strong>.
</p>

{reasonBlock}

<p style=""margin:0; color:{MutedTextColor};"">
  Podés cargar un nuevo comprobante para el mismo mes desde el sistema cuando quieras.
</p>";

        return Layout(neighborhoodName, $"Tu cuota de {period} fue rechazada", body);
    }
}
