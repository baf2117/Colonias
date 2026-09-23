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
import { Link, Title, useGetList, usePermissions } from 'react-admin'
import type { Permissions } from '../authProvider'
import { AppPageTitle } from '../components/AppPageTitle'
import { isAdminOrSuperAdmin, isSuperAdministrador } from '../components/RequireRole'
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
  guards: { staffId: number; name: string; salary: number; bono14: number; aguinaldo: number }[]
}

// Menos de medio centavo de diferencia se considera "cuadra" (redondeos).
const TOLERANCE = 0.005

function previousMonthValue(): string {
  const now = new Date()
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
}

function formatMonth(period: string): string {
  const text = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date(period))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function KpiCard({ label, value, caption, tone }: { label: string; value: string; caption?: ReactNode; tone?: 'success' | 'error' }) {
  return (
    <Card variant="outlined" sx={{ p: 2.5, minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="h5"
        fontWeight={700}
        sx={{ mt: 1, fontVariantNumeric: 'tabular-nums', color: tone ? `${tone}.main` : 'text.primary', overflowWrap: 'anywhere' }}
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
  if (difference === null) {
    return <Chip size="small" variant="outlined" label={missing} />
  }
  if (Math.abs(difference) < TOLERANCE) {
    return <Chip size="small" color="success" label="Cuadra" />
  }
  return <Chip size="small" color="warning" label={`No cuadra · ${difference > 0 ? '+' : ''}${formatMoney(difference)}`} />
}

function ReconciliationRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2}>
      <Typography variant="body2" color={strong ? 'text.primary' : 'text.secondary'} fontWeight={strong ? 600 : 400}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={strong ? 700 : 500} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {value}
      </Typography>
    </Stack>
  )
}

function SectionCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ p: 2.5, minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {title}
        </Typography>
        {action}
      </Stack>
      {children}
    </Card>
  )
}

function BenefitCard({ title, cycle, line, formatMoney }: { title: string; cycle: string; line: BenefitLine; formatMoney: (value: number) => string }) {
  const nextPayment = formatMonth(line.nextPaymentMonth).toLowerCase()
  const monthsText =
    line.monthsAccrued > 12
      ? `Ciclo anterior completo (se paga en ${nextPayment}) + ${line.monthsAccrued - 12} mes${line.monthsAccrued - 12 === 1 ? '' : 'es'} del nuevo`
      : `${line.monthsAccrued} de 12 meses acumulados`
  return (
    <Box sx={{ p: 2, bgcolor: 'action.hover', minWidth: 0 }}>
      <Typography variant="body2" fontWeight={700}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="div">
        {cycle}
      </Typography>
      <Typography variant="h6" fontWeight={700} sx={{ mt: 1, fontVariantNumeric: 'tabular-nums' }}>
        {formatMoney(line.accrued)}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="div">
        {monthsText}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="div">
        Próximo pago: {nextPayment} · {formatMoney(line.nextPaymentAmount)}
      </Typography>
    </Box>
  )
}

// Provisión de Bono 14 y aguinaldo de los guardias activos (un sueldo sin
// bonificación cada uno) contra la plata disponible. El cálculo y los
// ciclos viven en api/AccountStatement.cs.
function BenefitsSection({ benefits, formatMoney }: { benefits: Benefits; formatMoney: (value: number) => string }) {
  const covered = benefits.surplus >= 0
  const availableLabel = benefits.availableSource === 'bank' ? 'Saldo según el banco' : 'Saldo según el sistema (sin balance cargado)'
  const coveragePct = benefits.totalReserve > 0 ? Math.min(100, (Math.max(benefits.availableBalance, 0) / benefits.totalReserve) * 100) : 100

  if (benefits.activeGuards === 0) {
    return (
      <SectionCard title="Prestaciones de guardias">
        <Typography variant="body2" color="text.secondary">
          No hay guardias activos en esta colonia.
        </Typography>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Prestaciones de guardias · Bono 14 y aguinaldo"
      action={
        <Chip
          size="small"
          color={covered ? 'success' : 'warning'}
          label={covered ? `Cubierto · quedan ${formatMoney(benefits.surplus)} libres` : `Faltan ${formatMoney(-benefits.surplus)}`}
        />
      }
    >
      <Stack spacing={2.5}>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
          <BenefitCard title="Bono 14" cycle="Se acumula de julio a junio · se paga en junio" line={benefits.bono14} formatMoney={formatMoney} />
          <BenefitCard title="Aguinaldo" cycle="Se acumula de diciembre a noviembre · se paga en enero" line={benefits.aguinaldo} formatMoney={formatMoney} />
          <Stack spacing={1} sx={{ p: 2, minWidth: 0 }}>
            <ReconciliationRow label="Provisión necesaria" value={formatMoney(benefits.totalReserve)} strong />
            <ReconciliationRow label={availableLabel} value={formatMoney(benefits.availableBalance)} />
            <ReconciliationRow label={covered ? 'Queda libre' : 'Falta'} value={formatMoney(Math.abs(benefits.surplus))} strong />
            <LinearProgress variant="determinate" value={coveragePct} color={covered ? 'success' : 'warning'} sx={{ height: 8, mt: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              {covered ? 'La provisión está cubierta.' : `Solo está cubierto el ${Math.floor(coveragePct)} % de la provisión.`}
            </Typography>
          </Stack>
        </Box>

        {/* El API solo manda el detalle por guardia a un administrador
            (a un residente le llega vacío: son sueldos de personas). */}
        {benefits.guards.length > 0 ? (
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Guardia</TableCell>
                <TableCell align="right">Sueldo base</TableCell>
                <TableCell align="right">Bono 14 acumulado</TableCell>
                <TableCell align="right">Aguinaldo acumulado</TableCell>
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {benefits.guards.map((guard) => (
                <TableRow key={guard.staffId}>
                  <TableCell>{guard.name}</TableCell>
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
          Cada prestación es un sueldo base sin bonificación, proporcional a los meses acumulados. Se asume que cada una se paga en su mes de pago y que todos los guardias activos trabajaron el ciclo completo.
        </Typography>
      </Stack>
    </SectionCard>
  )
}

// Envía el estado de cuentas del mes a los vecinos de la colonia con
// correo habilitado (api/AccountStatement.cs, SendAccountStatement). El
// API es quien decide si se puede (balance del banco cargado, hay
// destinatarios, y "una vez por mes" si está activado); acá solo se
// refleja con el botón deshabilitado y el motivo en el tooltip.
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
  const [open, setOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const monthText = formatMonth(statement.period).toLowerCase()

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
      if (!response.ok) throw new Error(body?.message ?? 'No se pudo enviar el estado de cuentas.')
      const { sent, failed } = body as { sent: number; failed: number }
      if (failed === 0) {
        onSent(`Estado de cuentas de ${monthText} enviado a ${sent} vecino${sent === 1 ? '' : 's'}.`, 'success')
      } else if (sent > 0) {
        onSent(`Enviado a ${sent} vecino${sent === 1 ? '' : 's'}; ${failed} correo${failed === 1 ? '' : 's'} no se pudo enviar.`, 'warning')
      } else {
        onSent('No se pudo enviar ningún correo. Revisá la configuración de Brevo.', 'error')
      }
    } catch (sendError) {
      onSent(sendError instanceof Error ? sendError.message : 'No se pudo enviar el estado de cuentas.', 'error')
    } finally {
      setIsSending(false)
      setOpen(false)
    }
  }

  const lastSent = mailing.lastSentAt
    ? `Último envío: ${new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(mailing.lastSentAt))} · ${mailing.lastSentCount} vecino${mailing.lastSentCount === 1 ? '' : 's'}`
    : null

  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ ml: { md: 'auto' }, flexWrap: 'wrap', rowGap: 1 }}>
      {lastSent ? (
        <Typography variant="caption" color="text.secondary">
          {lastSent}
        </Typography>
      ) : null}
      <Tooltip title={mailing.blockedReason ?? ''} disableHoverListener={mailing.canSend}>
        <span>
          <Button variant="contained" startIcon={<SendIcon />} disabled={!mailing.canSend} onClick={() => setOpen(true)}>
            Enviar a vecinos
          </Button>
        </span>
      </Tooltip>
      <Dialog open={open} onClose={() => !isSending && setOpen(false)}>
        <DialogTitle>Enviar estado de cuentas</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Se va a enviar el estado de cuentas de {monthText} de {statement.neighborhoodName} por correo a{' '}
            <strong>
              {mailing.recipients} vecino{mailing.recipients === 1 ? '' : 's'}
            </strong>{' '}
            con correo habilitado, con el balance del banco adjunto.
            {lastSent ? ' Este mes ya se envió antes; se va a mandar de nuevo.' : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={isSending}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleSend} disabled={isSending} startIcon={isSending ? <CircularProgress size={16} /> : <SendIcon />}>
            {isSending ? 'Enviando…' : 'Enviar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

// Colonia a elegir: solo para SuperAdministrador (un Administrador ve
// siempre la suya, el API se la fuerza). Arranca con la primera colonia.
function NeighborhoodPicker({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
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
      renderInput={(params) => <TextField {...params} label="Colonia" />}
      sx={{ minWidth: 220, flex: '1 1 220px', maxWidth: 360 }}
    />
  )
}

// Estado de cuentas de un mes: ingresos (pagos aprobados), egresos
// (gastos + nómina pagada), resultado, y conciliación contra el saldo
// cargado en Balance Banco. Todo el cálculo vive en api/AccountStatement.cs.
export function AccountStatementPage() {
  const auth0 = useAuth0()
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
        if (!response.ok) throw new Error(body?.message ?? 'No se pudo cargar el estado de cuentas.')
        if (!cancelled) setResult({ key: requestKey, data: body as AccountStatement, error: null })
      } catch (loadError) {
        if (!cancelled) {
          setResult({
            key: requestKey,
            data: null,
            error: loadError instanceof Error ? loadError.message : 'No se pudo cargar el estado de cuentas.',
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [auth0, requestKey, year, monthNumber, neighborhoodId, isSuperAdmin])

  const formatMoney = useMemo(() => {
    const formatter = data ? new Intl.NumberFormat('es-GT', { style: 'currency', currency: data.currency }) : new Intl.NumberFormat('es')
    return (value: number) => formatter.format(value)
  }, [data])

  const breakdown: CategoryAmount[] = data
    ? [...data.expenses.byCategory, ...(data.expenses.payrollPaid > 0 ? [{ category: 'Nómina de guardias', amount: data.expenses.payrollPaid }] : [])].sort(
        (a, b) => b.amount - a.amount,
      )
    : []

  const collectionPct = data && data.income.activeUnits > 0 ? (data.income.unitsPaid / data.income.activeUnits) * 100 : 0

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Title title="Estado de cuentas" />
      <AppPageTitle sx={{ mt: 1, mb: 3 }}>Estado de cuentas</AppPageTitle>

      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', rowGap: 2, alignItems: 'center' }}>
        <TextField
          id="account-statement-month"
          type="month"
          size="small"
          label="Mes"
          value={month}
          onChange={(event) => event.target.value && setMonth(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 190 }}
        />
        {isSuperAdmin ? <NeighborhoodPicker value={neighborhoodId} onChange={setNeighborhoodId} /> : null}
        {isLoading ? <CircularProgress size={20} /> : null}
        {data ? (
          <Typography variant="body2" color="text.secondary">
            {data.neighborhoodName} · {formatMonth(data.period)} · {data.currency}
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
              label="Ingresos"
              value={formatMoney(data.income.approved)}
              caption={`${data.income.approvedCount} pago${data.income.approvedCount === 1 ? '' : 's'} aprobado${data.income.approvedCount === 1 ? '' : 's'}`}
            />
            <KpiCard
              label="Egresos"
              value={formatMoney(data.expenses.total)}
              caption={`${formatMoney(data.expenses.operating)} en gastos · ${formatMoney(data.expenses.payrollPaid)} en nómina`}
            />
            <KpiCard
              label="Resultado del mes"
              value={`${data.net > 0 ? '+' : ''}${formatMoney(data.net)}`}
              tone={data.net >= 0 ? 'success' : 'error'}
              caption="Ingresos − egresos"
            />
            <KpiCard
              label="Saldo según el banco"
              value={data.bank.balance !== null ? formatMoney(data.bank.balance) : 'Sin cargar'}
              caption={
                !isAdmin ? (
                  `Al cierre de ${formatMonth(data.period).toLowerCase()}`
                ) : data.bank.statementId !== null ? (
                  <Link to={`/bank-statements/${data.bank.statementId}/show`}>Ver balance cargado</Link>
                ) : (
                  <Link to="/bank-statements/create">Subir el balance de este mes</Link>
                )
              }
            />
          </Box>

          <SectionCard
            title="Conciliación con el banco"
            action={<DifferenceChip difference={data.bank.movementDifference} missing="Faltan balances para comparar" formatMoney={formatMoney} />}
          >
            <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
              <Stack spacing={1}>
                <Typography variant="overline" color="text.secondary">
                  Movimiento del mes
                </Typography>
                <ReconciliationRow
                  label={`Saldo banco ${formatMonth(data.bank.previousPeriod).toLowerCase()}`}
                  value={data.bank.previousBalance !== null ? formatMoney(data.bank.previousBalance) : 'Sin cargar'}
                />
                <ReconciliationRow
                  label={`Saldo banco ${formatMonth(data.period).toLowerCase()}`}
                  value={data.bank.balance !== null ? formatMoney(data.bank.balance) : 'Sin cargar'}
                />
                <ReconciliationRow label="Movimiento según el banco" value={data.bank.bankChange !== null ? formatMoney(data.bank.bankChange) : '—'} />
                <ReconciliationRow label="Resultado según el sistema" value={formatMoney(data.net)} />
                <ReconciliationRow
                  label="Diferencia"
                  value={data.bank.movementDifference !== null ? formatMoney(data.bank.movementDifference) : '—'}
                  strong
                />
                <Typography variant="caption" color="text.secondary">
                  Compara cuánto cambió el saldo del banco contra lo que el sistema dice que entró y salió. Necesita el balance de este mes y el del mes anterior.
                </Typography>
              </Stack>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Typography variant="overline" color="text.secondary">
                    Saldo acumulado
                  </Typography>
                  <DifferenceChip difference={data.bank.balanceDifference} missing="Sin balance" formatMoney={formatMoney} />
                </Stack>
                <ReconciliationRow label="Saldo según el sistema" value={formatMoney(data.bank.systemBalance)} />
                <ReconciliationRow label="Saldo según el banco" value={data.bank.balance !== null ? formatMoney(data.bank.balance) : 'Sin cargar'} />
                <ReconciliationRow
                  label="Diferencia"
                  value={data.bank.balanceDifference !== null ? formatMoney(data.bank.balanceDifference) : '—'}
                  strong
                />
                <Typography variant="caption" color="text.secondary">
                  Todo lo registrado en el sistema hasta fin de mes. Solo cuadra si la cuenta arrancó en cero cuando se empezó a usar el sistema.
                </Typography>
              </Stack>
            </Box>
          </SectionCard>

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' } }}>
            <SectionCard title="Ingresos y egresos · últimos 6 meses">
              <TrendChart points={data.trend} formatMoney={formatMoney} />
            </SectionCard>
            <SectionCard title="Egresos por categoría">
              <ExpenseBreakdown items={breakdown} formatMoney={formatMoney} />
            </SectionCard>
          </Box>

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <SectionCard title="Cobranza del mes">
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    Unidades al día
                  </Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {data.income.unitsPaid} de {data.income.activeUnits}
                  </Typography>
                </Stack>
                <LinearProgress variant="determinate" value={collectionPct} color="success" sx={{ height: 8 }} />
                <Typography variant="caption" color="text.secondary">
                  {data.income.activeUnits - data.income.unitsPaid} unidad{data.income.activeUnits - data.income.unitsPaid === 1 ? '' : 'es'} sin pago aprobado en este mes
                </Typography>
              </Stack>
            </SectionCard>
            <SectionCard title="Pendientes">
              <Stack spacing={1}>
                <ReconciliationRow
                  label={`${data.income.pendingCount} pago${data.income.pendingCount === 1 ? '' : 's'} por revisar`}
                  value={formatMoney(data.income.pending)}
                />
                <ReconciliationRow label="Nómina registrada sin pagar" value={formatMoney(data.expenses.payrollUnpaid)} />
                <Typography variant="caption" color="text.secondary">
                  No cuentan en los totales de arriba hasta que se aprueben o se marquen como pagados.
                </Typography>
                {isAdmin && data.income.pendingCount > 0 ? (
                  <Box>
                    <Button component={Link} to="/payments" variant="outlined" size="small">
                      Revisar pagos
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
