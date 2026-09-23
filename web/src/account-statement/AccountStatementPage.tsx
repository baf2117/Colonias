import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import SendIcon from '@mui/icons-material/Send'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { Link, Title, useGetList, usePermissions, useTranslate } from 'react-admin'
import type { Permissions } from '../authProvider'
import { AppPageTitle } from '../components/AppPageTitle'
import { isAdminOrSuperAdmin, isSuperAdministrador } from '../components/RequireRole'
import { formatMonthYear, formatMonthYearInSentence, useFormatLocale } from '../i18n/useFormatLocale'
import { ExpenseBreakdown, TrendChart, type CategoryAmount, type TrendPoint } from './AccountStatementCharts'

type AccountStatement = {
  neighborhoodId: number
  neighborhoodName: string
  currency: string
  period: string
  income: { approved: number; approvedCount: number; pending: number; pendingCount: number; activeUnits: number; unitsPaid: number }
  expenses: { operating: number; payrollPaid: number; payrollUnpaid: number; total: number; byCategory: CategoryAmount[] }
  net: number
  bank: {
    statementId: number | null
    balance: number | null
    previousPeriod: string
    previousBalance: number | null
    bankChange: number | null
    movementDifference: number | null
    systemBalance: number
    balanceDifference: number | null
  }
  trend: TrendPoint[]
  benefits: Benefits
  // null para un residente sin rol de administrador: no puede enviar.
  mailing: { recipients: number; lastSentAt: string | null; lastSentCount: number | null; canSend: boolean; blockedReason: string | null } | null
}

type BenefitLine = { monthsAccrued: number; accrued: number; nextPaymentMonth: string; nextPaymentAmount: number }

type Benefits = {
  activeGuards: number
  monthlySalaries: number
  bono14: BenefitLine
  aguinaldo: BenefitLine
  totalReserve: number
  availableBalance: number
  availableSource: 'bank' | 'system'
  surplus: number
  // Guardias activos sin fecha de contratación (se les provisiona el ciclo completo).
  guardsWithoutHireDate: number
  guards: { staffId: number; name: string; salary: number; hireDate: string | null; bono14: number; aguinaldo: number }[]
}

type Translate = (key: string, options?: Record<string, unknown>) => string

// Menos de medio centavo de diferencia se considera "cuadra" (redondeos).
const TOLERANCE = 0.005

function previousMonthValue(): string {
  const now = new Date()
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
}

// Todos los textos de esta pantalla viven en app.accountStatement.*.
function useT(): Translate {
  const translate = useTranslate()
  return (key, options) => translate(`app.accountStatement.${key}`, options)
}

function KpiCard({ label, value, caption, tone }: { label: string; value: string; caption?: ReactNode; tone?: 'success' | 'error' }) {
  return (
    <Card variant="outlined" sx={{ p: 2.5, minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="h5"
        sx={{ fontWeight: 700, mt: 1, fontVariantNumeric: 'tabular-nums', color: tone ? `${tone}.main` : 'text.primary', overflowWrap: 'anywhere' }}
      >
        {value}
      </Typography>
      {caption ? (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
          {caption}
        </Typography>
      ) : null}
    </Card>
  )
}

function DifferenceChip({ difference, missing, formatMoney }: { difference: number | null; missing: string; formatMoney: (value: number) => string }) {
  const t = useT()
  if (difference === null) {
    return <Chip size="small" variant="outlined" label={missing} />
  }
  if (Math.abs(difference) < TOLERANCE) {
    return <Chip size="small" color="success" label={t('matches')} />
  }
  return <Chip size="small" color="warning" label={t('mismatch', { amount: `${difference > 0 ? '+' : ''}${formatMoney(difference)}` })} />
}

function ReconciliationRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
      <Typography variant="body2" color={strong ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: strong ? 600 : 400 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {value}
      </Typography>
    </Stack>
  )
}

function SectionCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ p: 2.5, minWidth: 0 }}>
      <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {action}
      </Stack>
      {children}
    </Card>
  )
}

function BenefitCard({ title, cycle, line, formatMoney }: { title: string; cycle: string; line: BenefitLine; formatMoney: (value: number) => string }) {
  const t = useT()
  const formatLocale = useFormatLocale()
  const nextPayment = formatMonthYearInSentence(new Date(line.nextPaymentMonth), formatLocale)
  const monthsText =
    line.monthsAccrued > 12
      ? t('benefits.previousCycle', { month: nextPayment, smart_count: line.monthsAccrued - 12 })
      : t('benefits.monthsAccrued', { months: line.monthsAccrued })
  return (
    <Box sx={{ p: 2, bgcolor: 'action.hover', minWidth: 0 }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="div">
        {cycle}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 700, mt: 1, fontVariantNumeric: 'tabular-nums' }}>
        {formatMoney(line.accrued)}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="div">
        {monthsText}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="div">
        {t('benefits.nextPayment', { month: nextPayment, amount: formatMoney(line.nextPaymentAmount) })}
      </Typography>
    </Box>
  )
}

// Provisión de Bono 14 y aguinaldo de los guardias activos (un sueldo sin
// bonificación cada uno) contra la plata disponible. El cálculo y los
// ciclos viven en api/AccountStatement.cs.
function BenefitsSection({ benefits, formatMoney }: { benefits: Benefits; formatMoney: (value: number) => string }) {
  const t = useT()
  const formatLocale = useFormatLocale()
  const covered = benefits.surplus >= 0
  const availableLabel = benefits.availableSource === 'bank' ? t('benefits.availableBank') : t('benefits.availableSystem')
  const coveragePct = benefits.totalReserve > 0 ? Math.min(100, (Math.max(benefits.availableBalance, 0) / benefits.totalReserve) * 100) : 100

  if (benefits.activeGuards === 0) {
    return (
      <SectionCard title={t('benefits.title')}>
        <Typography variant="body2" color="text.secondary">
          {t('benefits.noGuards')}
        </Typography>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title={t('benefits.titleFull')}
      action={
        <Chip
          size="small"
          color={covered ? 'success' : 'warning'}
          label={
            covered
              ? t('benefits.coveredChip', { amount: formatMoney(benefits.surplus) })
              : t('benefits.missingChip', { amount: formatMoney(-benefits.surplus) })
          }
        />
      }
    >
      <Stack spacing={2.5}>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
          <BenefitCard title={t('benefits.bono14')} cycle={t('benefits.bono14Cycle')} line={benefits.bono14} formatMoney={formatMoney} />
          <BenefitCard title={t('benefits.aguinaldo')} cycle={t('benefits.aguinaldoCycle')} line={benefits.aguinaldo} formatMoney={formatMoney} />
          <Stack spacing={1} sx={{ p: 2, minWidth: 0 }}>
            <ReconciliationRow label={t('benefits.reserveNeeded')} value={formatMoney(benefits.totalReserve)} strong />
            <ReconciliationRow label={availableLabel} value={formatMoney(benefits.availableBalance)} />
            <ReconciliationRow label={covered ? t('benefits.left') : t('benefits.missing')} value={formatMoney(Math.abs(benefits.surplus))} strong />
            <LinearProgress variant="determinate" value={coveragePct} color={covered ? 'success' : 'warning'} sx={{ height: 8, mt: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              {covered ? t('benefits.covered') : t('benefits.partial', { pct: Math.floor(coveragePct) })}
            </Typography>
          </Stack>
        </Box>

        {/* El API solo manda el detalle por guardia a un administrador
            (a un residente le llega vacío: son sueldos de personas). */}
        {benefits.guards.length > 0 && benefits.guardsWithoutHireDate > 0 ? (
          <Alert severity="warning">{t('benefits.missingHireDate', { smart_count: benefits.guardsWithoutHireDate })}</Alert>
        ) : null}
        {benefits.guards.length > 0 ? (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('benefits.guard')}</TableCell>
                  <TableCell>{t('benefits.hiredOn')}</TableCell>
                  <TableCell align="right">{t('benefits.baseSalary')}</TableCell>
                  <TableCell align="right">{t('benefits.bono14Accrued')}</TableCell>
                  <TableCell align="right">{t('benefits.aguinaldoAccrued')}</TableCell>
                  <TableCell align="right">{t('benefits.total')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {benefits.guards.map((guard) => (
                  <TableRow key={guard.staffId}>
                    <TableCell>{guard.name}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', color: guard.hireDate ? undefined : 'warning.main' }}>
                      {guard.hireDate
                        ? new Date(guard.hireDate.slice(0, 10) + 'T00:00:00').toLocaleDateString(formatLocale)
                        : t('benefits.noHireDate')}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(guard.salary)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(guard.bono14)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(guard.aguinaldo)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {formatMoney(guard.bono14 + guard.aguinaldo)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}

        <Typography variant="caption" color="text.secondary">
          {t('benefits.note')}
        </Typography>
      </Stack>
    </SectionCard>
  )
}

// Envía el estado de cuentas del mes a los vecinos de la colonia con
// correo habilitado (api/AccountStatement.cs, SendAccountStatement). El
// API es quien decide si se puede (balance del banco cargado, hay
// destinatarios, y "una vez por mes" si está activado); acá solo se
// refleja con el botón deshabilitado y el motivo en el tooltip. El motivo
// (blockedReason) y los errores del API llegan en español: vienen del
// backend, no de las traducciones del frontend.
function SendToNeighborsButton({
  statement,
  mailing,
  neighborhoodId,
  onSent,
}: {
  statement: AccountStatement
  mailing: NonNullable<AccountStatement['mailing']>
  neighborhoodId: number | null
  onSent: (message: string, severity: 'success' | 'warning' | 'error') => void
}) {
  const auth0 = useAuth0()
  const t = useT()
  const formatLocale = useFormatLocale()
  const [open, setOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const monthText = formatMonthYearInSentence(new Date(statement.period), formatLocale)

  async function handleSend() {
    setIsSending(true)
    try {
      const period = new Date(statement.period)
      const token = await auth0.getAccessTokenSilently()
      const response = await fetch(`${import.meta.env.VITE_API_URL}/account-statement/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: period.getFullYear(), month: period.getMonth() + 1, neighborhoodId }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.message ?? t('send.failed'))
      const { sent, failed } = body as { sent: number; failed: number }
      if (failed === 0) {
        onSent(t('send.sentOk', { month: monthText, smart_count: sent }), 'success')
      } else if (sent > 0) {
        onSent(t('send.sentPartial', { sent, failed }), 'warning')
      } else {
        onSent(t('send.sentNone'), 'error')
      }
    } catch (sendError) {
      onSent(sendError instanceof Error ? sendError.message : t('send.failed'), 'error')
    } finally {
      setIsSending(false)
      setOpen(false)
    }
  }

  const lastSent = mailing.lastSentAt
    ? t('send.lastSent', {
        date: new Intl.DateTimeFormat(formatLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(mailing.lastSentAt)),
        smart_count: mailing.lastSentCount ?? 0,
      })
    : null

  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', ml: { md: 'auto' }, flexWrap: 'wrap', rowGap: 1 }}>
      {lastSent ? (
        <Typography variant="caption" color="text.secondary">
          {lastSent}
        </Typography>
      ) : null}
      <Tooltip title={mailing.blockedReason ?? ''} disableHoverListener={mailing.canSend}>
        <span>
          <Button variant="contained" startIcon={<SendIcon />} disabled={!mailing.canSend} onClick={() => setOpen(true)}>
            {t('send.button')}
          </Button>
        </span>
      </Tooltip>
      <Dialog open={open} onClose={() => !isSending && setOpen(false)}>
        <DialogTitle>{t('send.dialogTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('send.dialogBody', { month: monthText, neighborhood: statement.neighborhoodName, smart_count: mailing.recipients })}
            {lastSent ? ` ${t('send.alreadySent')}` : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={isSending}>
            {t('send.cancel')}
          </Button>
          <Button variant="contained" onClick={handleSend} disabled={isSending} startIcon={isSending ? <CircularProgress size={16} /> : <SendIcon />}>
            {isSending ? t('send.sending') : t('send.send')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

// Colonia a elegir: solo para SuperAdministrador (un Administrador ve
// siempre la suya, el API se la fuerza). Arranca con la primera colonia.
function NeighborhoodPicker({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const translate = useTranslate()
  const { data: neighborhoods, isLoading } = useGetList('neighborhoods', {
    pagination: { page: 1, perPage: 100 },
    sort: { field: 'name', order: 'ASC' },
  })

  useEffect(() => {
    if (value === null && neighborhoods && neighborhoods.length > 0) {
      onChange(neighborhoods[0].id as number)
    }
  }, [value, neighborhoods, onChange])

  const selected = neighborhoods?.find((n) => n.id === value) ?? null

  return (
    <Autocomplete
      id="account-statement-neighborhood"
      size="small"
      options={neighborhoods ?? []}
      loading={isLoading}
      getOptionLabel={(option) => option.name ?? ''}
      isOptionEqualToValue={(option, selectedOption) => option.id === selectedOption.id}
      value={selected}
      onChange={(_event, newValue) => onChange(newValue ? (newValue.id as number) : null)}
      renderInput={(params) => <TextField {...params} label={translate('app.common.neighborhood')} />}
      sx={{ minWidth: 220, flex: '1 1 220px', maxWidth: 360 }}
    />
  )
}

// Estado de cuentas de un mes: ingresos (pagos aprobados recibidos en el
// mes, por fecha de pago), egresos (gastos + nómina pagada), resultado, y
// conciliación contra el saldo cargado en Balance Banco. Todo el cálculo
// vive en api/AccountStatement.cs.
export function AccountStatementPage() {
  const auth0 = useAuth0()
  const t = useT()
  const translate = useTranslate()
  const formatLocale = useFormatLocale()
  const { permissions } = usePermissions<Permissions>()
  const isSuperAdmin = isSuperAdministrador(permissions ?? null)
  const isAdmin = isAdminOrSuperAdmin(permissions ?? null)

  const [month, setMonth] = useState(previousMonthValue())
  const [neighborhoodId, setNeighborhoodId] = useState<number | null>(null)
  // El resultado se guarda junto con la clave del pedido que lo generó:
  // "cargando" es simplemente que la clave actual todavía no tiene
  // resultado. Mientras carga se sigue mostrando el mes anterior.
  const [result, setResult] = useState<{ key: string; data: AccountStatement | null; error: string | null } | null>(null)

  // Se incrementa después de enviar, para recargar y mostrar el último envío.
  const [reloadCount, setReloadCount] = useState(0)
  const [sendNotice, setSendNotice] = useState<{ message: string; severity: 'success' | 'warning' | 'error' } | null>(null)

  const [year, monthNumber] = month.split('-').map(Number)
  const requestKey =
    year && monthNumber && (!isSuperAdmin || neighborhoodId !== null)
      ? `${year}-${monthNumber}-${neighborhoodId ?? 'own'}-${reloadCount}`
      : null
  const isLoading = requestKey !== null && result?.key !== requestKey
  const data = result?.data ?? null
  const error = result?.key === requestKey ? result.error : null
  const loadFailedMessage = t('loadFailed')

  useEffect(() => {
    if (requestKey === null) return
    let cancelled = false
    ;(async () => {
      try {
        const token = await auth0.getAccessTokenSilently()
        const params = new URLSearchParams({ year: String(year), month: String(monthNumber) })
        if (isSuperAdmin && neighborhoodId !== null) params.set('neighborhoodId', String(neighborhoodId))
        const response = await fetch(`${import.meta.env.VITE_API_URL}/account-statement?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.message ?? loadFailedMessage)
        if (!cancelled) setResult({ key: requestKey, data: body as AccountStatement, error: null })
      } catch (loadError) {
        if (!cancelled) {
          setResult({
            key: requestKey,
            data: null,
            error: loadError instanceof Error ? loadError.message : loadFailedMessage,
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // loadFailedMessage cambia con el idioma; no hace falta volver a pedir los datos por eso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth0, requestKey, year, monthNumber, neighborhoodId, isSuperAdmin])

  const formatMoney = useMemo(() => {
    const formatter = data ? new Intl.NumberFormat(formatLocale, { style: 'currency', currency: data.currency }) : new Intl.NumberFormat(formatLocale)
    return (value: number) => formatter.format(value)
  }, [data, formatLocale])

  const breakdown: CategoryAmount[] = data
    ? [...data.expenses.byCategory, ...(data.expenses.payrollPaid > 0 ? [{ category: t('payrollCategory'), amount: data.expenses.payrollPaid }] : [])].sort(
        (a, b) => b.amount - a.amount,
      )
    : []

  const collectionPct = data && data.income.activeUnits > 0 ? (data.income.unitsPaid / data.income.activeUnits) * 100 : 0
  const notLoaded = t('notLoaded')
  const monthInSentence = (period: string) => formatMonthYearInSentence(new Date(period), formatLocale)

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Title title={t('title')} />
      <AppPageTitle sx={{ mt: 1, mb: 3 }}>{t('title')}</AppPageTitle>

      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', rowGap: 2, alignItems: 'center' }}>
        <TextField
          id="account-statement-month"
          type="month"
          size="small"
          label={translate('app.common.month')}
          value={month}
          onChange={(event) => event.target.value && setMonth(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 190 }}
        />
        {isSuperAdmin ? <NeighborhoodPicker value={neighborhoodId} onChange={setNeighborhoodId} /> : null}
        {isLoading ? <CircularProgress size={20} /> : null}
        {data ? (
          <Typography variant="body2" color="text.secondary">
            {data.neighborhoodName} · {formatMonthYear(new Date(data.period), formatLocale)} · {data.currency}
          </Typography>
        ) : null}
        {data?.mailing && !isLoading ? (
          <SendToNeighborsButton
            statement={data}
            mailing={data.mailing}
            neighborhoodId={neighborhoodId}
            onSent={(message, severity) => {
              setSendNotice({ message, severity })
              setReloadCount((count) => count + 1)
            }}
          />
        ) : null}
      </Stack>

      {sendNotice ? (
        <Alert severity={sendNotice.severity} onClose={() => setSendNotice(null)} sx={{ mb: 3 }}>
          {sendNotice.message}
        </Alert>
      ) : null}

      {error ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      ) : null}

      {data ? (
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' } }}>
            <KpiCard
              label={t('income')}
              value={formatMoney(data.income.approved)}
              caption={t('paymentsReceived', { smart_count: data.income.approvedCount })}
            />
            <KpiCard
              label={t('expenses')}
              value={formatMoney(data.expenses.total)}
              caption={t('expensesCaption', { operating: formatMoney(data.expenses.operating), payroll: formatMoney(data.expenses.payrollPaid) })}
            />
            <KpiCard
              label={t('net')}
              value={`${data.net > 0 ? '+' : ''}${formatMoney(data.net)}`}
              tone={data.net >= 0 ? 'success' : 'error'}
              caption={t('netCaption')}
            />
            <KpiCard
              label={t('bankBalance')}
              value={data.bank.balance !== null ? formatMoney(data.bank.balance) : notLoaded}
              caption={
                !isAdmin ? (
                  t('atMonthEnd', { month: monthInSentence(data.period) })
                ) : data.bank.statementId !== null ? (
                  <Link to={`/bank-statements/${data.bank.statementId}/show`}>{t('viewLoadedBalance')}</Link>
                ) : (
                  <Link to="/bank-statements/create">{t('uploadThisMonth')}</Link>
                )
              }
            />
          </Box>

          <SectionCard
            title={t('reconciliation')}
            action={<DifferenceChip difference={data.bank.movementDifference} missing={t('missingBalances')} formatMoney={formatMoney} />}
          >
            <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
              <Stack spacing={1}>
                <Typography variant="overline" color="text.secondary">
                  {t('monthMovement')}
                </Typography>
                <ReconciliationRow
                  label={t('bankBalanceOf', { month: monthInSentence(data.bank.previousPeriod) })}
                  value={data.bank.previousBalance !== null ? formatMoney(data.bank.previousBalance) : notLoaded}
                />
                <ReconciliationRow
                  label={t('bankBalanceOf', { month: monthInSentence(data.period) })}
                  value={data.bank.balance !== null ? formatMoney(data.bank.balance) : notLoaded}
                />
                <ReconciliationRow label={t('bankMovement')} value={data.bank.bankChange !== null ? formatMoney(data.bank.bankChange) : '—'} />
                <ReconciliationRow label={t('systemResult')} value={formatMoney(data.net)} />
                <ReconciliationRow
                  label={t('difference')}
                  value={data.bank.movementDifference !== null ? formatMoney(data.bank.movementDifference) : '—'}
                  strong
                />
                <Typography variant="caption" color="text.secondary">
                  {t('movementHelp')}
                </Typography>
              </Stack>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="overline" color="text.secondary">
                    {t('cumulative')}
                  </Typography>
                  <DifferenceChip difference={data.bank.balanceDifference} missing={t('noBalance')} formatMoney={formatMoney} />
                </Stack>
                <ReconciliationRow label={t('systemBalance')} value={formatMoney(data.bank.systemBalance)} />
                <ReconciliationRow label={t('bankBalance')} value={data.bank.balance !== null ? formatMoney(data.bank.balance) : notLoaded} />
                <ReconciliationRow
                  label={t('difference')}
                  value={data.bank.balanceDifference !== null ? formatMoney(data.bank.balanceDifference) : '—'}
                  strong
                />
                <Typography variant="caption" color="text.secondary">
                  {t('cumulativeHelp')}
                </Typography>
              </Stack>
            </Box>
          </SectionCard>

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' } }}>
            <SectionCard title={t('trendTitle')}>
              <TrendChart points={data.trend} formatMoney={formatMoney} />
            </SectionCard>
            <SectionCard title={t('byCategory')}>
              <ExpenseBreakdown items={breakdown} formatMoney={formatMoney} />
            </SectionCard>
          </Box>

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <SectionCard title={t('collection')}>
              <Stack spacing={1}>
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('unitsUpToDate')}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {t('unitsOf', { paid: data.income.unitsPaid, total: data.income.activeUnits })}
                  </Typography>
                </Stack>
                <LinearProgress variant="determinate" value={collectionPct} color="success" sx={{ height: 8 }} />
                <Typography variant="caption" color="text.secondary">
                  {t('unitsUnpaid', { smart_count: data.income.activeUnits - data.income.unitsPaid })}
                </Typography>
              </Stack>
            </SectionCard>
            <SectionCard title={t('pending')}>
              <Stack spacing={1}>
                <ReconciliationRow label={t('pendingPayments', { smart_count: data.income.pendingCount })} value={formatMoney(data.income.pending)} />
                <ReconciliationRow label={t('unpaidPayroll')} value={formatMoney(data.expenses.payrollUnpaid)} />
                <Typography variant="caption" color="text.secondary">
                  {t('pendingHelp')}
                </Typography>
                {isAdmin && data.income.pendingCount > 0 ? (
                  <Box>
                    <Button component={Link} to="/payments" variant="outlined" size="small">
                      {t('reviewPayments')}
                    </Button>
                  </Box>
                ) : null}
              </Stack>
            </SectionCard>
          </Box>

          <BenefitsSection benefits={data.benefits} formatMoney={formatMoney} />
        </Stack>
      ) : null}
    </Box>
  )
}
