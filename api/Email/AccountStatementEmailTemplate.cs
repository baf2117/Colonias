using System.Globalization;
using System.Net;
using System.Text;
using static Neighborhood.AccountStatement;
using static Neighborhood.Email.PaymentEmailTemplates;

namespace Neighborhood.Email;

/// <summary>
/// Correo del estado de cuentas mensual para los vecinos: las mismas
/// secciones que la pantalla "Estado de cuentas" (web/src/account-statement),
/// en HTML de correo -- tablas y estilos inline, sin SVG (Gmail y Outlook no
/// lo muestran), así que las barras de las gráficas son celdas de tabla con
/// alto/ancho fijo. Usa el mismo envoltorio (Layout) y paleta que los correos
/// de Pagos.
///
/// Diferencia deliberada con la pantalla: de las prestaciones de guardias
/// solo va el total (Bono 14, aguinaldo, si está cubierto), NUNCA la tabla
/// por guardia -- son sueldos de personas puntuales y el correo le llega a
/// todos los vecinos.
/// </summary>
public static class AccountStatementEmailTemplate
{
    private const string IncomeColor = ApprovedColor;
    private const string ExpenseColor = AccentColor;
    private const string NeutralChipColor = "#7d7979";
    private const string HighlightColumnColor = "#f1eded";
    private const int ChartHeight = 120;

    private static readonly string[] SpanishMonths =
    {
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    };

    private static string E(string? text) => WebUtility.HtmlEncode(text ?? "");

    private static string MonthYear(DateTime period) => $"{SpanishMonths[period.Month - 1]} de {period.Year}";

    private static string Capitalized(string text) => text.Length == 0 ? text : char.ToUpperInvariant(text[0]) + text[1..];

    private static string ShortMonth(DateTime period) => $"{SpanishMonths[period.Month - 1][..3]} {period.Year % 100:00}";

    // Formato a mano (no CultureInfo "es-GT": el runtime de Functions
    // puede no traer esos datos). InvariantCulture da 1,234.56, que es
    // como se escriben los montos en Guatemala.
    private static string Money(decimal value, string currency)
    {
        var symbol = currency switch
        {
            "GTQ" => "Q",
            "USD" => "US$",
            "MXN" => "MX$",
            "EUR" => "€",
            _ => currency + " ",
        };
        var sign = value < 0 ? "-" : "";
        return $"{sign}{symbol}{Math.Abs(value).ToString("N2", CultureInfo.InvariantCulture)}";
    }

    private static string SignedMoney(decimal value, string currency) => (value > 0 ? "+" : "") + Money(value, currency);

    private static string Chip(string label, string color) =>
        $@"<span style=""display:inline-block; padding:3px 10px; background-color:{color}; color:#ffffff; font-size:11px; font-weight:600; letter-spacing:0.03em; text-transform:uppercase;"">{E(label)}</span>";

    private static string DifferenceChip(decimal? difference, string missingLabel, string currency)
    {
        if (difference is null) return Chip(missingLabel, NeutralChipColor);
        if (Math.Abs(difference.Value) < 0.005m) return Chip("Cuadra", ApprovedColor);
        return Chip($"No cuadra · {SignedMoney(difference.Value, currency)}", RejectedColor);
    }

    private static string SectionTitle(string title, string? rightHtml = null) => $@"
<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""margin:28px 0 12px 0;"">
  <tr>
    <td style=""font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:{MutedTextColor};"">{E(title)}</td>
    {(rightHtml is null ? "" : $@"<td align=""right"">{rightHtml}</td>")}
  </tr>
</table>";

    private static string Row(string label, string value, bool strong = false) => $@"
<tr>
  <td style=""padding:5px 0; font-size:14px; color:{(strong ? TextColor : MutedTextColor)}; {(strong ? "font-weight:600;" : "")}"">{E(label)}</td>
  <td align=""right"" style=""padding:5px 0; font-size:14px; color:{TextColor}; font-weight:{(strong ? 700 : 500)}; white-space:nowrap;"">{E(value)}</td>
</tr>";

    private static string Caption(string text) =>
        $@"<p style=""margin:6px 0 0 0; font-size:12px; line-height:1.5; color:{MutedTextColor};"">{E(text)}</p>";

    // Barra horizontal: `percent` (0-100) del ancho en `color`, el resto gris.
    private static string Bar(decimal percent, string color, int height = 8)
    {
        var pct = (int)Math.Round(Math.Clamp(percent, 0, 100));
        var filled = pct > 0 ? $@"<td width=""{pct}%"" style=""height:{height}px; background-color:{color}; font-size:0; line-height:0;"">&nbsp;</td>" : "";
        var empty = pct < 100 ? $@"<td style=""height:{height}px; background-color:{BorderColor}; font-size:0; line-height:0;"">&nbsp;</td>" : "";
        return $@"<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0""><tr>{filled}{empty}</tr></table>";
    }

    private static string KpiCell(string label, string value, string caption, string valueColor) => $@"
<td width=""50%"" valign=""top"" style=""padding:0 6px 12px 0;"">
  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background-color:{BackgroundColor};"">
    <tr><td style=""padding:14px 16px;"">
      <div style=""font-size:12px; color:{MutedTextColor};"">{E(label)}</div>
      <div style=""font-size:20px; font-weight:700; color:{valueColor}; margin-top:6px; white-space:nowrap;"">{E(value)}</div>
      <div style=""font-size:12px; color:{MutedTextColor}; margin-top:4px;"">{E(caption)}</div>
    </td></tr>
  </table>
</td>";

    private static decimal NiceMax(decimal value)
    {
        if (value <= 0) return 1;
        var exponent = Math.Floor(Math.Log10((double)value));
        var magnitude = (decimal)Math.Pow(10, exponent);
        var fraction = value / magnitude;
        var nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
        return nice * magnitude;
    }

    private static string VerticalBar(decimal value, decimal max, string color, string title)
    {
        var height = max > 0 ? (int)Math.Round(value / max * ChartHeight) : 0;
        if (height < 1) height = 1;
        return $@"<table role=""presentation"" cellpadding=""0"" cellspacing=""0""><tr><td width=""14"" title=""{E(title)}"" style=""width:14px; height:{height}px; background-color:{(value > 0 ? color : BorderColor)}; font-size:0; line-height:0;"">&nbsp;</td></tr></table>";
    }

    private static string TrendChart(IReadOnlyList<TrendPoint> trend, string currency)
    {
        var max = NiceMax(trend.Count == 0 ? 0 : trend.Max(p => Math.Max(p.Income, p.Expenses)));
        var columnWidth = trend.Count == 0 ? 100 : 100 / trend.Count;
        var bars = new StringBuilder();
        var labels = new StringBuilder();
        var values = new StringBuilder();

        for (var i = 0; i < trend.Count; i++)
        {
            var point = trend[i];
            var selected = i == trend.Count - 1;
            var background = selected ? $"background-color:{HighlightColumnColor};" : "";
            bars.Append($@"
<td width=""{columnWidth}%"" align=""center"" valign=""bottom"" height=""{ChartHeight + 8}"" style=""height:{ChartHeight + 8}px; padding:0 2px; {background}"">
  <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" align=""center""><tr>
    <td valign=""bottom"" style=""padding-right:3px;"">{VerticalBar(point.Income, max, IncomeColor, $"Ingresos: {Money(point.Income, currency)}")}</td>
    <td valign=""bottom"">{VerticalBar(point.Expenses, max, ExpenseColor, $"Egresos: {Money(point.Expenses, currency)}")}</td>
  </tr></table>
</td>");
            labels.Append($@"<td align=""center"" style=""padding:6px 2px 0 2px; font-size:11px; color:{(selected ? TextColor : MutedTextColor)}; font-weight:{(selected ? 700 : 400)}; border-top:2px solid {BorderColor};"">{E(ShortMonth(point.Period))}</td>");
            values.Append($@"
<tr>
  <td style=""padding:3px 0; font-size:12px; color:{(selected ? TextColor : MutedTextColor)}; font-weight:{(selected ? 700 : 400)};"">{E(Capitalized(MonthYear(point.Period)))}</td>
  <td align=""right"" style=""padding:3px 0; font-size:12px; color:{IncomeColor}; white-space:nowrap;"">{E(Money(point.Income, currency))}</td>
  <td align=""right"" style=""padding:3px 0 3px 12px; font-size:12px; color:{ExpenseColor}; white-space:nowrap;"">{E(Money(point.Expenses, currency))}</td>
</tr>");
        }

        return $@"
<table role=""presentation"" cellpadding=""0"" cellspacing=""0"" style=""margin-bottom:10px;"">
  <tr>
    <td style=""width:10px; height:10px; background-color:{IncomeColor}; font-size:0; line-height:0;"">&nbsp;</td>
    <td style=""padding:0 16px 0 6px; font-size:12px; color:{MutedTextColor};"">Ingresos</td>
    <td style=""width:10px; height:10px; background-color:{ExpenseColor}; font-size:0; line-height:0;"">&nbsp;</td>
    <td style=""padding:0 0 0 6px; font-size:12px; color:{MutedTextColor};"">Egresos</td>
  </tr>
</table>
<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"">
  <tr>{bars}</tr>
  <tr>{labels}</tr>
</table>
<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""margin-top:14px;"">
  <tr>
    <td style=""padding:3px 0; font-size:11px; color:{MutedTextColor}; text-transform:uppercase; letter-spacing:0.05em;"">Mes</td>
    <td align=""right"" style=""padding:3px 0; font-size:11px; color:{MutedTextColor}; text-transform:uppercase; letter-spacing:0.05em;"">Ingresos</td>
    <td align=""right"" style=""padding:3px 0 3px 12px; font-size:11px; color:{MutedTextColor}; text-transform:uppercase; letter-spacing:0.05em;"">Egresos</td>
  </tr>
  {values}
</table>";
    }

    private static string ExpenseBreakdown(AccountStatementDto s)
    {
        var items = s.Expenses.ByCategory.ToList();
        if (s.Expenses.PayrollPaid > 0)
        {
            items.Add(new CategoryAmount("Nómina de guardias", s.Expenses.PayrollPaid));
        }
        items = items.OrderByDescending(i => i.Amount).ToList();

        if (items.Count == 0)
        {
            return $@"<p style=""margin:0; font-size:14px; color:{MutedTextColor};"">No hubo egresos registrados en este mes.</p>";
        }

        var max = items.Max(i => i.Amount);
        var html = new StringBuilder();
        foreach (var item in items)
        {
            html.Append($@"
<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""margin-bottom:10px;"">
  <tr>
    <td style=""font-size:14px; padding-bottom:4px;"">{E(item.Category)}</td>
    <td align=""right"" style=""font-size:14px; font-weight:600; padding-bottom:4px; white-space:nowrap;"">{E(Money(item.Amount, s.Currency))}</td>
  </tr>
  <tr><td colspan=""2"">{Bar(max > 0 ? item.Amount / max * 100 : 0, ExpenseColor)}</td></tr>
</table>");
        }
        return html.ToString();
    }

    public static string Subject(AccountStatementDto s) =>
        $"Estado de cuentas de {MonthYear(s.Period)} · {s.NeighborhoodName}";

    public static string Build(AccountStatementDto s, string recipientName)
    {
        var c = s.Currency;
        var month = MonthYear(s.Period);
        var previousMonth = MonthYear(s.Bank.PreviousPeriod);
        var bankBalanceText = s.Bank.Balance is null ? "Sin cargar" : Money(s.Bank.Balance.Value, c);
        var unitsWithoutPayment = s.Income.ActiveUnits - s.Income.UnitsPaid;
        var collectionPct = s.Income.ActiveUnits > 0 ? (decimal)s.Income.UnitsPaid / s.Income.ActiveUnits * 100 : 0;
        var b = s.Benefits;
        var covered = b.Surplus >= 0;
        var availableLabel = b.AvailableSource == "bank" ? "Saldo según el banco" : "Saldo según el sistema";
        var coveragePct = b.TotalReserve > 0 ? Math.Max(b.AvailableBalance, 0) / b.TotalReserve * 100 : 100;

        var benefitsSection = b.ActiveGuards == 0 ? "" : $@"
{SectionTitle("Prestaciones de guardias", Chip(covered ? "Cubierto" : $"Faltan {Money(-b.Surplus, c)}", covered ? ApprovedColor : RejectedColor))}
<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"">
  {Row($"Bono 14 acumulado ({Math.Min(b.Bono14.MonthsAccrued, 12)} de 12 meses)", Money(b.Bono14.Accrued, c))}
  {Row($"Aguinaldo acumulado{(b.Aguinaldo.MonthsAccrued > 12 ? " (incluye el ciclo anterior, se paga en enero)" : $" ({b.Aguinaldo.MonthsAccrued} de 12 meses)")}", Money(b.Aguinaldo.Accrued, c))}
  {Row("Provisión necesaria", Money(b.TotalReserve, c), strong: true)}
  {Row(availableLabel, Money(b.AvailableBalance, c))}
  {Row(covered ? "Queda libre" : "Falta", Money(Math.Abs(b.Surplus), c), strong: true)}
</table>
<div style=""margin-top:8px;"">{Bar(coveragePct, covered ? ApprovedColor : RejectedColor)}</div>
{Caption($"Lo que debería estar ahorrado para pagar el Bono 14 (junio) y el aguinaldo (enero) de los {b.ActiveGuards} guardia{(b.ActiveGuards == 1 ? "" : "s")} de la colonia: un sueldo base cada uno, proporcional al tiempo trabajado en cada ciclo.")}";

        var body = $@"
<h1 style=""margin:0 0 6px 0; font-size:24px; line-height:1.25; font-weight:700; color:{TextColor};"">Estado de cuentas</h1>
<p style=""margin:0 0 20px 0; font-size:14px; color:{MutedTextColor};"">{E(Capitalized(month))}</p>

<p style=""margin:0 0 20px 0;"">Hola <strong>{E(recipientName)}</strong>, este es el resumen de ingresos y egresos de <strong>{E(s.NeighborhoodName)}</strong> de {E(month)}, cuadrado contra el saldo del banco. Adjuntamos el balance del banco del mes.</p>

<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"">
  <tr>
    {KpiCell("Ingresos", Money(s.Income.Approved, c), $"{s.Income.ApprovedCount} pago{(s.Income.ApprovedCount == 1 ? "" : "s")} recibido{(s.Income.ApprovedCount == 1 ? "" : "s")} en el mes", TextColor)}
    {KpiCell("Egresos", Money(s.Expenses.Total, c), $"{Money(s.Expenses.Operating, c)} en gastos · {Money(s.Expenses.PayrollPaid, c)} en nómina", TextColor)}
  </tr>
  <tr>
    {KpiCell("Resultado del mes", SignedMoney(s.Net, c), "Ingresos − egresos", s.Net >= 0 ? IncomeColor : RejectedColor)}
    {KpiCell("Saldo según el banco", bankBalanceText, $"Al cierre de {month}", TextColor)}
  </tr>
</table>

{SectionTitle("Conciliación con el banco", DifferenceChip(s.Bank.MovementDifference, "Faltan balances", c))}
<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"">
  {Row($"Saldo banco {previousMonth}", s.Bank.PreviousBalance is null ? "Sin cargar" : Money(s.Bank.PreviousBalance.Value, c))}
  {Row($"Saldo banco {month}", bankBalanceText)}
  {Row("Movimiento según el banco", s.Bank.BankChange is null ? "—" : Money(s.Bank.BankChange.Value, c))}
  {Row("Resultado según el sistema", Money(s.Net, c))}
  {Row("Diferencia", s.Bank.MovementDifference is null ? "—" : Money(s.Bank.MovementDifference.Value, c), strong: true)}
</table>
{Caption("Compara cuánto cambió el saldo del banco contra lo que el sistema registra que entró y salió en el mes.")}

<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""margin-top:18px;"">
  <tr>
    <td style=""font-size:12px; font-weight:600; color:{MutedTextColor}; padding-bottom:4px;"">Saldo acumulado</td>
    <td align=""right"" style=""padding-bottom:4px;"">{DifferenceChip(s.Bank.BalanceDifference, "Sin balance", c)}</td>
  </tr>
  {Row("Saldo según el sistema", Money(s.Bank.SystemBalance, c))}
  {Row("Saldo según el banco", bankBalanceText)}
  {Row("Diferencia", s.Bank.BalanceDifference is null ? "—" : Money(s.Bank.BalanceDifference.Value, c), strong: true)}
</table>

{SectionTitle("Ingresos y egresos · últimos 6 meses")}
{TrendChart(s.Trend, c)}

{SectionTitle("Egresos por categoría")}
{ExpenseBreakdown(s)}

{SectionTitle("Cobranza del mes")}
<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"">
  {Row("Unidades al día", $"{s.Income.UnitsPaid} de {s.Income.ActiveUnits}", strong: true)}
</table>
<div style=""margin-top:6px;"">{Bar(collectionPct, IncomeColor)}</div>
{Caption($"{unitsWithoutPayment} unidad{(unitsWithoutPayment == 1 ? "" : "es")} con la cuota de este mes sin pagar.")}

{SectionTitle("Pendientes")}
<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"">
  {Row($"{s.Income.PendingCount} pago{(s.Income.PendingCount == 1 ? "" : "s")} por revisar", Money(s.Income.Pending, c))}
  {Row("Nómina registrada sin pagar", Money(s.Expenses.PayrollUnpaid, c))}
</table>
{Caption("No cuentan en los totales de arriba hasta que se aprueben o se paguen.")}
{benefitsSection}";

        var preheader = $"{Capitalized(month)}: ingresos {Money(s.Income.Approved, c)}, egresos {Money(s.Expenses.Total, c)}, saldo banco {bankBalanceText}.";
        return Layout(E(s.NeighborhoodName), E(preheader), body);
    }
}
