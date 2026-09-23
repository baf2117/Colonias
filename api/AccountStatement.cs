using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using Neighborhood.Auth;
using Neighborhood.Database;
using Neighborhood.Email;

namespace Neighborhood;

// Estado de cuentas de una colonia para un mes: ingresos, egresos,
// resultado, y la conciliación contra el saldo que se cargó en Balance
// Banco (dbo.BankStatements). Lo ven administradores y residentes (cada
// uno acotado a su colonia, ver ResolveTargetAsync); solo un
// administrador envía por correo. Un SuperAdministrador tiene que elegir
// una colonia -- no se suman colonias entre sí porque cada una puede
// cobrar en su propia moneda.
//
// Criterios (los mismos que el Panel general, salvo nómina):
//   - Ingresos: pagos APROBADOS cuyo Period es el mes pedido.
//   - Egresos: gastos cuya Date cae en el mes + nómina del mes marcada
//     como pagada (Paid = 1). A diferencia del Panel general, la nómina
//     todavía no pagada NO cuenta como egreso: no salió plata del banco.
//     Se devuelve aparte como "pendiente de pagar".
//
// Conciliación, dos lecturas:
//   - Movimiento del mes: (saldo banco del mes - saldo banco del mes
//     anterior) vs. resultado del sistema (ingresos - egresos). Solo se
//     puede calcular si se cargaron los dos estados de cuenta.
//   - Saldo acumulado: todo lo registrado en el sistema hasta fin de mes
//     vs. saldo del banco. Cuadra solo si la cuenta arrancó en cero junto
//     con el sistema; sirve como referencia.
// Si hay más de un estado de cuenta cargado para el mismo mes, se usa el
// último subido.
public class AccountStatement
{
    private readonly ILogger<AccountStatement> _logger;

    public AccountStatement(ILogger<AccountStatement> logger)
    {
        _logger = logger;
    }

    private const int TrendMonths = 6;

    public record CategoryAmount(string Category, decimal Amount);

    public record IncomeDto(decimal Approved, int ApprovedCount, decimal Pending, int PendingCount, int ActiveUnits, int UnitsPaid);

    public record ExpensesDto(decimal Operating, decimal PayrollPaid, decimal PayrollUnpaid, decimal Total, IReadOnlyList<CategoryAmount> ByCategory);

    public record BankDto(
        int? StatementId,
        decimal? Balance,
        DateTime PreviousPeriod,
        decimal? PreviousBalance,
        decimal? BankChange,
        decimal? MovementDifference,
        decimal SystemBalance,
        decimal? BalanceDifference);

    public record TrendPoint(DateTime Period, decimal Income, decimal Expenses, decimal? BankBalance);

    public record BenefitLine(int MonthsAccrued, decimal Accrued, DateTime NextPaymentMonth, decimal NextPaymentAmount);

    public record GuardReserve(int StaffId, string Name, decimal Salary, decimal Bono14, decimal Aguinaldo);

    // Provisión de prestaciones de guardias (Bono 14 y aguinaldo): cuánto
    // debería estar guardado al cierre del mes para poder pagarlas, contra
    // la plata disponible (saldo del banco del mes si se cargó; si no, el
    // saldo acumulado del sistema -- AvailableSource dice cuál).
    public record BenefitsDto(
        int ActiveGuards,
        decimal MonthlySalaries,
        BenefitLine Bono14,
        BenefitLine Aguinaldo,
        decimal TotalReserve,
        decimal AvailableBalance,
        string AvailableSource,
        decimal Surplus,
        IReadOnlyList<GuardReserve> Guards);

    public record AccountStatementDto(
        int NeighborhoodId,
        string NeighborhoodName,
        string Currency,
        DateTime Period,
        IncomeDto Income,
        ExpensesDto Expenses,
        decimal Net,
        BankDto Bank,
        IReadOnlyList<TrendPoint> Trend,
        BenefitsDto Benefits,
        MailingDto? Mailing);

    // Estado del envío a vecinos para la colonia y mes: a cuántos les
    // llegaría, el último envío, y si se puede mandar (y si no, por qué).
    public record MailingDto(int Recipients, DateTime? LastSentAt, int? LastSentCount, bool CanSend, string? BlockedReason);

    // Prestaciones de Guatemala, un sueldo base (Salary, SIN la
    // bonificación -- SecurityStaff.Bonuses) cada una:
    //   - Bono 14 (Decreto 42-92): se acumula de julio a junio. Se paga en
    //     junio (a pedido del usuario; la ley fija la primera quincena de
    //     julio -- si cambia, es Bono14PaymentMonth).
    //   - Aguinaldo (Decreto 76-78): se acumula de diciembre a noviembre y
    //     se paga en enero.
    // Se asume que cada pago se hace en su mes de pago: al cierre de ese
    // mes ya no se provisiona. Por eso el aguinaldo en diciembre pide 13/12
    // (el ciclo que cerró en noviembre, todavía sin pagar, más diciembre del
    // ciclo nuevo). Cuenta el ciclo completo para cada guardia activo: no
    // hay fecha de contratación en SecurityStaff (CreatedAt es la fecha de
    // alta en el sistema), así que a un guardia nuevo se le provisiona de
    // más, nunca de menos.
    private const int Bono14CycleStartMonth = 7;
    private const int Bono14PaymentMonth = 6;
    private const int AguinaldoCycleStartMonth = 12;
    private const int AguinaldoPaymentMonth = 1;

    // Meses acumulados al cierre del mes `month` para una prestación cuyo
    // ciclo arranca en `cycleStart` y se paga en `paymentMonth` (dentro de
    // los meses siguientes al cierre del ciclo, o en su último mes).
    private static int MonthsAccrued(int month, int cycleStart, int paymentMonth)
    {
        var inCurrentCycle = ((month - cycleStart + 12) % 12) + 1;
        var cycleEnd = ((cycleStart + 10) % 12) + 1;
        if (paymentMonth == cycleEnd)
        {
            // Se paga en el último mes del ciclo (Bono 14 en junio): al
            // cierre de ese mes ya está pagado.
            return month == paymentMonth ? 0 : inCurrentCycle;
        }
        // Se paga después de cerrar el ciclo (aguinaldo en enero): entre el
        // cierre y el mes de pago todavía se debe el ciclo anterior entero.
        var monthsFromCycleStartToPayment = ((paymentMonth - cycleStart + 12) % 12) + 1;
        var previousCycleStillOwed = inCurrentCycle < monthsFromCycleStartToPayment;
        return inCurrentCycle + (previousCycleStillOwed ? 12 : 0);
    }

    private static DateTime NextPaymentMonth(DateTime period, int paymentMonth)
    {
        var candidate = new DateTime(period.Year, paymentMonth, 1);
        return candidate > period ? candidate : candidate.AddYears(1);
    }

    private static IActionResult BadRequest(string message) => new BadRequestObjectResult(new { error = message, message });

    private static IActionResult Forbidden(string message) =>
        new ObjectResult(new { error = message, message }) { StatusCode = StatusCodes.Status403Forbidden };

    private static bool IsAdmin(CurrentUser? currentUser) =>
        currentUser is not null && (currentUser.Administrador || currentUser.SuperAdministrador);

    // Colonia y mes pedidos, validados. Quién ve qué colonia (siempre se
    // ignora requestedNeighborhoodId salvo para un SuperAdministrador):
    //   - SuperAdministrador: la que elija.
    //   - Administrador: la que administra (currentUser.NeighborhoodId).
    //   - Residente sin rol de administrador: la de su unidad. Solo ve,
    //     no envía (ver Send) y no recibe el detalle por guardia (ver Get).
    private static async Task<(int NeighborhoodId, IActionResult? Error)> ResolveTargetAsync(
        SqlConnection connection, CurrentUser? currentUser, int year, int month, int? requestedNeighborhoodId)
    {
        if (currentUser is null)
        {
            return (0, Forbidden("Solo los residentes y administradores pueden ver el estado de cuentas."));
        }
        if (year < 2000 || year > 2100 || month < 1 || month > 12)
        {
            return (0, BadRequest("Indicá un mes y año válidos."));
        }
        if (currentUser.SuperAdministrador)
        {
            return requestedNeighborhoodId is > 0
                ? (requestedNeighborhoodId.Value, null)
                : (0, BadRequest("Elegí una colonia."));
        }
        if (currentUser.Administrador)
        {
            return currentUser.NeighborhoodId is null
                ? (0, BadRequest("No tenés una colonia asignada. Pedile a un superadministrador que te asigne una."))
                : (currentUser.NeighborhoodId.Value, null);
        }

        if (currentUser.UnitId is null)
        {
            return (0, BadRequest("No tenés una unidad asignada."));
        }
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT NeighborhoodId FROM dbo.Units WHERE UnitId = @unitId";
        cmd.Parameters.AddWithValue("@unitId", currentUser.UnitId.Value);
        return await cmd.ExecuteScalarAsync() is int unitNeighborhoodId
            ? (unitNeighborhoodId, null)
            : (0, BadRequest("No tenés una unidad asignada."));
    }

    private static int? QueryInt(HttpRequest req, string name) =>
        int.TryParse(req.Query[name], out var value) ? value : null;

    [Function("GetAccountStatement")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "account-statement")] HttpRequest req)
    {
        var year = QueryInt(req, "year") ?? 0;
        var month = QueryInt(req, "month") ?? 0;
        var currentUser = req.HttpContext.GetCurrentUser();

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        var (neighborhoodId, error) = await ResolveTargetAsync(connection, currentUser, year, month, QueryInt(req, "neighborhoodId"));
        if (error is not null)
        {
            return error;
        }

        var statement = await BuildAsync(connection, neighborhoodId, year, month);
        if (statement is null)
        {
            return new NotFoundResult();
        }

        // Un residente sin rol de administrador ve los totales, pero no el
        // sueldo de cada guardia ni nada del envío por correo (Mailing null
        // = el frontend no muestra el botón).
        if (!IsAdmin(currentUser))
        {
            return new OkObjectResult(statement with
            {
                Benefits = statement.Benefits with { Guards = Array.Empty<GuardReserve>() },
            });
        }

        var mailing = await BuildMailingStatusAsync(connection, statement);
        return new OkObjectResult(statement with { Mailing = mailing });
    }

    // --- Envío a vecinos ---
    //
    // Destinatarios: residentes activos con unidad activa en la colonia,
    // con correo cargado y ReceiveEmails = 1 (sin repetir correo si dos
    // residentes comparten uno). Solo se puede enviar si ya se cargó el
    // balance del banco de ese mes. "Una vez por mes" está apagado por
    // defecto; se prende con el app setting AccountStatementOncePerMonth =
    // true, sin cambios de base (dbo.AccountStatementMailings ya registra
    // cada envío).
    private static bool OncePerMonth =>
        bool.TryParse(Environment.GetEnvironmentVariable("AccountStatementOncePerMonth"), out var enabled) && enabled;

    private static async Task<List<(string Name, string Email)>> LoadRecipientsAsync(SqlConnection connection, int neighborhoodId)
    {
        var recipients = new List<(string Name, string Email)>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT R.Name, LTRIM(RTRIM(R.Email))
            FROM dbo.Residents R
            JOIN dbo.Units U ON U.UnitId = R.UnitId
            WHERE U.NeighborhoodId = @n AND U.Active = 1
              AND R.Active = 1 AND R.ReceiveEmails = 1
              AND R.Email IS NOT NULL AND LTRIM(RTRIM(R.Email)) <> ''
            ORDER BY R.Name";
        cmd.Parameters.AddWithValue("@n", neighborhoodId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var email = reader.GetString(1);
            if (seen.Add(email))
            {
                recipients.Add((reader.GetString(0), email));
            }
        }
        return recipients;
    }

    private static async Task<MailingDto> BuildMailingStatusAsync(SqlConnection connection, AccountStatementDto statement)
    {
        var recipients = (await LoadRecipientsAsync(connection, statement.NeighborhoodId)).Count;

        DateTime? lastSentAt = null;
        int? lastSentCount = null;
        await using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = @"
                SELECT TOP 1 SentAt, RecipientCount FROM dbo.AccountStatementMailings
                WHERE NeighborhoodId = @n AND Period = @period
                ORDER BY SentAt DESC";
            cmd.Parameters.AddWithValue("@n", statement.NeighborhoodId);
            cmd.Parameters.AddWithValue("@period", statement.Period);
            await using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                lastSentAt = DateTime.SpecifyKind(reader.GetDateTime(0), DateTimeKind.Utc);
                lastSentCount = reader.GetInt32(1);
            }
        }

        string? blockedReason =
            statement.Bank.StatementId is null ? "Primero cargá el balance del banco de este mes en Balance Banco."
            : recipients == 0 ? "Ningún vecino de esta colonia tiene correo cargado y habilitado."
            : OncePerMonth && lastSentAt is not null ? "El estado de cuentas de este mes ya se envió."
            : null;

        return new MailingDto(recipients, lastSentAt, lastSentCount, blockedReason is null, blockedReason);
    }

    // Archivo del balance del banco usado en el estado de cuentas, listo
    // para adjuntar: "balance-banco-2026-08.pdf" (la extensión del archivo
    // subido). Null si no hay archivo o no se pudo bajar.
    private async Task<EmailAttachment?> LoadBankStatementAttachmentAsync(SqlConnection connection, AccountStatementDto statement)
    {
        if (statement.Bank.StatementId is null)
        {
            return null;
        }

        string? blobPath;
        await using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = "SELECT StatementBlobPath FROM dbo.BankStatements WHERE BankStatementId = @id";
            cmd.Parameters.AddWithValue("@id", statement.Bank.StatementId.Value);
            blobPath = await cmd.ExecuteScalarAsync() as string;
        }
        if (string.IsNullOrWhiteSpace(blobPath))
        {
            return null;
        }

        try
        {
            var content = await Neighborhood.Storage.BlobStorageService.DownloadAsync(blobPath);
            if (content is null)
            {
                return null;
            }
            var extension = Path.GetExtension(blobPath).ToLowerInvariant();
            return new EmailAttachment($"balance-banco-{statement.Period:yyyy-MM}{extension}", content);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo bajar el balance del banco {BlobPath} para adjuntarlo", blobPath);
            return null;
        }
    }

    public record SendBody(int Year, int Month, int? NeighborhoodId);

    public record SendResultDto(int Sent, int Failed, int Recipients);

    [Function("SendAccountStatement")]
    public async Task<IActionResult> Send(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "account-statement/send")] HttpRequest req)
    {
        var body = await JsonSerializer.DeserializeAsync<SendBody>(
            req.Body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        var currentUser = req.HttpContext.GetCurrentUser();
        if (!IsAdmin(currentUser))
        {
            return Forbidden("Solo un administrador puede enviar el estado de cuentas.");
        }

        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync();

        var (neighborhoodId, error) = await ResolveTargetAsync(connection, currentUser, body?.Year ?? 0, body?.Month ?? 0, body?.NeighborhoodId);
        if (error is not null)
        {
            return error;
        }

        var statement = await BuildAsync(connection, neighborhoodId, body!.Year, body.Month);
        if (statement is null)
        {
            return new NotFoundResult();
        }

        var mailing = await BuildMailingStatusAsync(connection, statement);
        if (!mailing.CanSend)
        {
            return new ConflictObjectResult(new { error = mailing.BlockedReason, message = mailing.BlockedReason });
        }

        // El archivo del balance del banco va adjunto en cada correo. Se baja
        // una sola vez de Blob Storage; si no se puede leer, no se manda
        // nada (el usuario pidió que el correo lleve el balance).
        var attachment = await LoadBankStatementAttachmentAsync(connection, statement);
        if (attachment is null)
        {
            const string message = "No se pudo leer el archivo del balance del banco de este mes. Subilo de nuevo en Balance Banco.";
            return new ConflictObjectResult(new { error = message, message });
        }
        var attachments = new[] { attachment };

        var recipients = await LoadRecipientsAsync(connection, neighborhoodId);
        var subject = AccountStatementEmailTemplate.Subject(statement);
        int sent = 0, failed = 0;

        foreach (var (name, email) in recipients)
        {
            try
            {
                var result = await EmailService.SendAsync(email, name, subject, AccountStatementEmailTemplate.Build(statement, name), attachments);
                if (result.Success)
                {
                    sent++;
                }
                else
                {
                    failed++;
                    _logger.LogWarning(
                        "No se pudo enviar el estado de cuentas a {Email} (colonia {NeighborhoodId}): {StatusCode} {Body}",
                        email, neighborhoodId, result.StatusCode, result.ResponseBody);
                }
            }
            catch (Exception ex)
            {
                failed++;
                _logger.LogWarning(ex, "Error al enviar el estado de cuentas a {Email} (colonia {NeighborhoodId})", email, neighborhoodId);
            }
        }

        if (sent > 0)
        {
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO dbo.AccountStatementMailings (NeighborhoodId, Period, BankStatementId, SentByUserId, RecipientCount, FailedCount)
                VALUES (@n, @period, @bankStatementId, @sentBy, @sent, @failed)";
            cmd.Parameters.AddWithValue("@n", neighborhoodId);
            cmd.Parameters.AddWithValue("@period", statement.Period);
            cmd.Parameters.AddWithValue("@bankStatementId", statement.Bank.StatementId!.Value);
            cmd.Parameters.AddWithValue("@sentBy", currentUser!.ResidentId);
            cmd.Parameters.AddWithValue("@sent", sent);
            cmd.Parameters.AddWithValue("@failed", failed);
            await cmd.ExecuteNonQueryAsync();
        }

        _logger.LogInformation(
            "Estado de cuentas {Period:yyyy-MM} de la colonia {NeighborhoodId}: {Sent} enviados, {Failed} fallidos",
            statement.Period, neighborhoodId, sent, failed);

        return new OkObjectResult(new SendResultDto(sent, failed, recipients.Count));
    }

    // Todo el cálculo del estado de cuentas, sin nada de HTTP: lo usan la
    // pantalla (GetAccountStatement) y el envío por correo
    // (SendAccountStatement). Null si la colonia no existe.
    private static async Task<AccountStatementDto?> BuildAsync(SqlConnection connection, int neighborhoodId, int year, int month)
    {
        var period = new DateTime(year, month, 1);
        var nextPeriod = period.AddMonths(1);
        var previousPeriod = period.AddMonths(-1);
        var trendStart = period.AddMonths(-(TrendMonths - 1));

        string neighborhoodName, currency;
        await using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = "SELECT Name, Currency FROM dbo.Neighborhoods WHERE NeighborhoodId = @n";
            cmd.Parameters.AddWithValue("@n", neighborhoodId);
            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                return null;
            }
            neighborhoodName = reader.GetString(0);
            currency = reader.GetString(1);
        }

        var parameters = new Dictionary<string, object>
        {
            ["@n"] = neighborhoodId,
            ["@period"] = period,
            ["@next"] = nextPeriod,
            ["@prev"] = previousPeriod,
            ["@trendStart"] = trendStart,
        };

        // --- Ingresos ---
        var (approved, approvedCount) = await SumAndCountAsync(connection, parameters, @"
            SELECT COALESCE(SUM(P.Amount), 0), COUNT(*)
            FROM dbo.Payments P JOIN dbo.Units U ON U.UnitId = P.UnitId
            WHERE U.NeighborhoodId = @n AND P.Period = @period AND P.Status = 'approved'");
        var (pending, pendingCount) = await SumAndCountAsync(connection, parameters, @"
            SELECT COALESCE(SUM(P.Amount), 0), COUNT(*)
            FROM dbo.Payments P JOIN dbo.Units U ON U.UnitId = P.UnitId
            WHERE U.NeighborhoodId = @n AND P.Period = @period AND P.Status = 'pending'");
        var activeUnits = (int)await ScalarDecimalAsync(connection, parameters,
            "SELECT COUNT(*) FROM dbo.Units WHERE NeighborhoodId = @n AND Active = 1");
        var unitsPaid = (int)await ScalarDecimalAsync(connection, parameters, @"
            SELECT COUNT(DISTINCT P.UnitId)
            FROM dbo.Payments P JOIN dbo.Units U ON U.UnitId = P.UnitId
            WHERE U.NeighborhoodId = @n AND U.Active = 1 AND P.Period = @period AND P.Status = 'approved'");

        // --- Egresos ---
        var byCategory = new List<CategoryAmount>();
        await using (var cmd = CreateCommand(connection, parameters, @"
            SELECT COALESCE(NULLIF(LTRIM(RTRIM(E.Category)), ''), 'Sin categoría') AS Category, SUM(E.Amount) AS Amount
            FROM dbo.Expenses E JOIN dbo.Vendors V ON V.VendorId = E.VendorId
            WHERE V.NeighborhoodId = @n AND E.Date >= @period AND E.Date < @next
            GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(E.Category)), ''), 'Sin categoría')
            ORDER BY SUM(E.Amount) DESC"))
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                byCategory.Add(new CategoryAmount(reader.GetString(0), reader.GetDecimal(1)));
            }
        }
        var operating = byCategory.Sum(c => c.Amount);

        var payrollPaid = await ScalarDecimalAsync(connection, parameters, @"
            SELECT COALESCE(SUM(PR.Amount), 0)
            FROM dbo.Payroll PR JOIN dbo.SecurityStaff S ON S.StaffId = PR.StaffId
            WHERE S.NeighborhoodId = @n AND PR.Period = @period AND PR.Paid = 1");
        var payrollUnpaid = await ScalarDecimalAsync(connection, parameters, @"
            SELECT COALESCE(SUM(PR.Amount), 0)
            FROM dbo.Payroll PR JOIN dbo.SecurityStaff S ON S.StaffId = PR.StaffId
            WHERE S.NeighborhoodId = @n AND PR.Period = @period AND PR.Paid = 0");

        var expensesTotal = operating + payrollPaid;
        var net = approved - expensesTotal;

        // --- Banco ---
        var (statementId, bankBalance) = await LatestStatementAsync(connection, neighborhoodId, period);
        var (_, previousBalance) = await LatestStatementAsync(connection, neighborhoodId, previousPeriod);
        decimal? bankChange = bankBalance is not null && previousBalance is not null ? bankBalance - previousBalance : null;
        decimal? movementDifference = bankChange is not null ? bankChange - net : null;

        var systemBalance = await ScalarDecimalAsync(connection, parameters, @"
            SELECT
                (SELECT COALESCE(SUM(P.Amount), 0) FROM dbo.Payments P JOIN dbo.Units U ON U.UnitId = P.UnitId
                 WHERE U.NeighborhoodId = @n AND P.Status = 'approved' AND P.Period <= @period)
              - (SELECT COALESCE(SUM(E.Amount), 0) FROM dbo.Expenses E JOIN dbo.Vendors V ON V.VendorId = E.VendorId
                 WHERE V.NeighborhoodId = @n AND E.Date < @next)
              - (SELECT COALESCE(SUM(PR.Amount), 0) FROM dbo.Payroll PR JOIN dbo.SecurityStaff S ON S.StaffId = PR.StaffId
                 WHERE S.NeighborhoodId = @n AND PR.Paid = 1 AND PR.Period <= @period)");
        decimal? balanceDifference = bankBalance is not null ? bankBalance - systemBalance : null;

        // --- Tendencia (últimos meses hasta el pedido) ---
        var trendIncome = await GroupedByPeriodAsync(connection, parameters, @"
            SELECT P.Period, SUM(P.Amount)
            FROM dbo.Payments P JOIN dbo.Units U ON U.UnitId = P.UnitId
            WHERE U.NeighborhoodId = @n AND P.Status = 'approved' AND P.Period >= @trendStart AND P.Period <= @period
            GROUP BY P.Period");
        var trendExpenses = await GroupedByPeriodAsync(connection, parameters, @"
            SELECT DATEFROMPARTS(YEAR(E.Date), MONTH(E.Date), 1), SUM(E.Amount)
            FROM dbo.Expenses E JOIN dbo.Vendors V ON V.VendorId = E.VendorId
            WHERE V.NeighborhoodId = @n AND E.Date >= @trendStart AND E.Date < @next
            GROUP BY DATEFROMPARTS(YEAR(E.Date), MONTH(E.Date), 1)");
        var trendPayroll = await GroupedByPeriodAsync(connection, parameters, @"
            SELECT PR.Period, SUM(PR.Amount)
            FROM dbo.Payroll PR JOIN dbo.SecurityStaff S ON S.StaffId = PR.StaffId
            WHERE S.NeighborhoodId = @n AND PR.Paid = 1 AND PR.Period >= @trendStart AND PR.Period <= @period
            GROUP BY PR.Period");
        var trendBank = await GroupedByPeriodAsync(connection, parameters, @"
            SELECT B.Period, B.BankBalance
            FROM dbo.BankStatements B
            WHERE B.NeighborhoodId = @n AND B.Period >= @trendStart AND B.Period <= @period
              AND B.BankStatementId = (
                  SELECT TOP 1 B2.BankStatementId FROM dbo.BankStatements B2
                  WHERE B2.NeighborhoodId = B.NeighborhoodId AND B2.Period = B.Period
                  ORDER BY B2.CreatedAt DESC, B2.BankStatementId DESC)");

        var trend = new List<TrendPoint>();
        for (var p = trendStart; p <= period; p = p.AddMonths(1))
        {
            trend.Add(new TrendPoint(
                p,
                trendIncome.GetValueOrDefault(p),
                trendExpenses.GetValueOrDefault(p) + trendPayroll.GetValueOrDefault(p),
                trendBank.TryGetValue(p, out var b) ? b : null));
        }

        // --- Prestaciones de guardias ---
        var bono14Months = MonthsAccrued(month, Bono14CycleStartMonth, Bono14PaymentMonth);
        var aguinaldoMonths = MonthsAccrued(month, AguinaldoCycleStartMonth, AguinaldoPaymentMonth);

        var guards = new List<GuardReserve>();
        await using (var cmd = CreateCommand(connection, parameters, @"
            SELECT StaffId, Name, Salary FROM dbo.SecurityStaff
            WHERE NeighborhoodId = @n AND Active = 1
            ORDER BY Name"))
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                var salary = reader.GetDecimal(2);
                guards.Add(new GuardReserve(
                    reader.GetInt32(0),
                    reader.GetString(1),
                    salary,
                    Math.Round(salary * bono14Months / 12m, 2),
                    Math.Round(salary * aguinaldoMonths / 12m, 2)));
            }
        }

        var monthlySalaries = guards.Sum(g => g.Salary);
        var bono14Accrued = guards.Sum(g => g.Bono14);
        var aguinaldoAccrued = guards.Sum(g => g.Aguinaldo);
        var totalReserve = bono14Accrued + aguinaldoAccrued;
        var availableBalance = bankBalance ?? systemBalance;

        var benefits = new BenefitsDto(
            guards.Count,
            monthlySalaries,
            new BenefitLine(bono14Months, bono14Accrued, NextPaymentMonth(period, Bono14PaymentMonth), monthlySalaries),
            new BenefitLine(aguinaldoMonths, aguinaldoAccrued, NextPaymentMonth(period, AguinaldoPaymentMonth), monthlySalaries),
            totalReserve,
            availableBalance,
            bankBalance is not null ? "bank" : "system",
            availableBalance - totalReserve,
            guards);

        return new AccountStatementDto(
            neighborhoodId,
            neighborhoodName,
            currency,
            period,
            new IncomeDto(approved, approvedCount, pending, pendingCount, activeUnits, unitsPaid),
            new ExpensesDto(operating, payrollPaid, payrollUnpaid, expensesTotal, byCategory),
            net,
            new BankDto(statementId, bankBalance, previousPeriod, previousBalance, bankChange, movementDifference, systemBalance, balanceDifference),
            trend,
            benefits,
            null);
    }

    private static SqlCommand CreateCommand(SqlConnection connection, Dictionary<string, object> parameters, string sql)
    {
        var cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        foreach (var (name, value) in parameters)
        {
            if (sql.Contains(name, StringComparison.Ordinal))
            {
                cmd.Parameters.AddWithValue(name, value);
            }
        }
        return cmd;
    }

    private static async Task<decimal> ScalarDecimalAsync(SqlConnection connection, Dictionary<string, object> parameters, string sql)
    {
        await using var cmd = CreateCommand(connection, parameters, sql);
        var result = await cmd.ExecuteScalarAsync();
        return result is null or DBNull ? 0 : Convert.ToDecimal(result);
    }

    private static async Task<(decimal Sum, int Count)> SumAndCountAsync(SqlConnection connection, Dictionary<string, object> parameters, string sql)
    {
        await using var cmd = CreateCommand(connection, parameters, sql);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (reader.GetDecimal(0), reader.GetInt32(1));
    }

    private static async Task<Dictionary<DateTime, decimal>> GroupedByPeriodAsync(SqlConnection connection, Dictionary<string, object> parameters, string sql)
    {
        var result = new Dictionary<DateTime, decimal>();
        await using var cmd = CreateCommand(connection, parameters, sql);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            result[reader.GetDateTime(0)] = reader.GetDecimal(1);
        }
        return result;
    }

    private static async Task<(int? Id, decimal? Balance)> LatestStatementAsync(SqlConnection connection, int neighborhoodId, DateTime period)
    {
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT TOP 1 BankStatementId, BankBalance
            FROM dbo.BankStatements
            WHERE NeighborhoodId = @n AND Period = @period
            ORDER BY CreatedAt DESC, BankStatementId DESC";
        cmd.Parameters.AddWithValue("@n", neighborhoodId);
        cmd.Parameters.AddWithValue("@period", period);
        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? (reader.GetInt32(0), reader.GetDecimal(1)) : (null, null);
    }
}
