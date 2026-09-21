import { Box, Card, Typography } from '@mui/material'
import { Title, useGetList } from 'react-admin'
import { MyUnitSection } from './MyUnitSection'

// El mes se calcula del reloj del navegador (Intl, sin tabla de nombres
// a mano) en vez de venir quemado en sampleData.ts — así "Panel general"
// siempre muestra el mes en curso sin tocar código cada mes.
function periodoActual(): string {
  const parts = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).formatToParts(new Date())
  const mes = parts.find((part) => part.type === 'month')?.value ?? ''
  const anio = parts.find((part) => part.type === 'year')?.value ?? ''
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${anio}`
}

// Formato de número simple, sin símbolo de moneda: el sistema es
// multi-colonia y cada una puede tener la suya (Neighborhoods.Currency),
// así que un símbolo fijo ($, Q, etc.) en un panel que suma varias
// colonias sería incorrecto — mismo criterio que ya usa la lista de
// Gastos (ver "Gastos y proveedores" en el documento de arquitectura).
const numberFormat = new Intl.NumberFormat('es')

function sumAmount(records: readonly { amount?: unknown }[] | undefined): number {
  return (records ?? []).reduce((total, record) => total + Number(record.amount ?? 0), 0)
}

// Pantalla "Inicio" — cascarón visual calcado del Design (Panel general),
// reducido a lo que hoy tiene datos reales. Todavía no hay endpoint de
// resumen en la API, así que "Recaudado del mes" y "Gastos del mes" se
// calculan acá mismo con tres useGetList (pagos aprobados, gastos y
// nómina del mes en curso) en vez de sumarlos del lado del servidor — a
// esta escala no hace falta un endpoint de agregación aparte. La
// cantidad de unidades del encabezado también es real, vía /api/units.
// "Exportar"/"Registrar pago", "Cobros del mes", "Reportes abiertos",
// "Visitas de hoy", "Actividad reciente" y "Presupuesto del año" se
// sacaron del todo (a pedido del usuario, en varias rondas): eran
// cascarón visual con datos de ejemplo (sampleData.ts) sin ningún
// endpoint real detrás todavía, y mostrar un número inventado es peor
// que no mostrar nada.
export default function Dashboard() {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  // perPage: 1 porque solo hace falta el total (viene en Content-Range,
  // igual que cualquier otra lista de este proyecto) — no los datos de
  // cada unidad. /api/units está restringido a Administrador/
  // SuperAdministrador (ver api/Units.cs, RequireAdminOrSuperAdmin): para
  // cualquier otro rol esto devuelve 403, así que la cantidad de
  // unidades simplemente no se muestra en vez de mostrar un error.
  const { total: unitsTotal, isLoading: unitsLoading, error: unitsError } = useGetList('units', {
    pagination: { page: 1, perPage: 1 },
    sort: { field: 'id', order: 'ASC' },
  })

  // Recaudado del mes: solo pagos de residentes ya aprobados
  // (Status = 'approved') con Period en el mes en curso — un pago
  // pendiente o rechazado todavía no es plata "recaudada". perPage 1000
  // trae todos los pagos del mes en una sola página para sumarlos acá
  // (a esta escala, un mes con más de 1000 pagos no es un caso real
  // todavía); `total` (de Content-Range) es la cuenta real para el
  // detalle, no `data.length`.
  const {
    data: approvedPayments,
    total: approvedPaymentsCount,
    isLoading: paymentsLoading,
    error: paymentsError,
  } = useGetList('payments', {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: 'id', order: 'ASC' },
    filter: { month: currentMonth, year: currentYear, status: 'approved' },
  })

  // Gastos del mes: gastos administrativos (/api/expenses) más pagos de
  // nómina a guardias (/api/payroll) del mes en curso, sumados en un
  // solo KPI — así lo pidió el usuario. GetList/GetOne de /api/expenses
  // están abiertos a cualquier usuario autenticado (ver api/Expenses.cs,
  // RequireAdminOrSuperAdmin solo protege Create/Update/Delete) para que
  // este KPI se vea sin necesitar rol de administrador; si de todos
  // modos esa llamada llegara a fallar, no se muestra un total parcial
  // (sería "Gastos" mostrando solo nómina) — se oculta el KPI entero.
  const {
    data: monthExpenses,
    isLoading: expensesLoading,
    error: expensesError,
  } = useGetList('expenses', {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: 'id', order: 'ASC' },
    filter: { month: currentMonth, year: currentYear },
  })

  const {
    data: monthPayroll,
    isLoading: payrollLoading,
    error: payrollError,
  } = useGetList('payroll', {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: 'id', order: 'ASC' },
    filter: { month: currentMonth, year: currentYear },
  })

  const recaudadoDelMes = sumAmount(approvedPayments)
  const gastosMes = sumAmount(monthExpenses)
  const nominaMes = sumAmount(monthPayroll)
  const gastosLoading = expensesLoading || payrollLoading
  const gastosError = expensesError || payrollError

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Title title="Panel general" />

      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" fontWeight={700}>
          Panel general
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {periodoActual().toUpperCase()}
          {!unitsLoading && !unitsError && typeof unitsTotal === 'number' ? ` · ${unitsTotal} UNIDADES` : null}
        </Typography>
      </Box>

      {/* Solo se ve si el usuario actual tiene una unidad asignada (ver
          MyUnitSection.tsx / GET /api/units/mine) — un guardia o un
          residente sin unidad no ven nada acá. */}
      <MyUnitSection />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 2,
          mb: 3,
        }}
      >
        <Card variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="body2" color="text.secondary">
            Recaudado del mes
          </Typography>
          <Typography variant="h4" fontWeight={700} sx={{ mt: 1 }}>
            {paymentsLoading || paymentsError ? '—' : numberFormat.format(recaudadoDelMes)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {!paymentsLoading && !paymentsError
              ? `${approvedPaymentsCount ?? 0} pago${(approvedPaymentsCount ?? 0) === 1 ? '' : 's'} aprobado${(approvedPaymentsCount ?? 0) === 1 ? '' : 's'}`
              : null}
          </Typography>
        </Card>

        <Card variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="body2" color="text.secondary">
            Gastos del mes
          </Typography>
          <Typography variant="h4" fontWeight={700} sx={{ mt: 1 }}>
            {gastosLoading || gastosError ? '—' : numberFormat.format(gastosMes + nominaMes)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {!gastosLoading && !gastosError
              ? `${numberFormat.format(gastosMes)} en gastos · ${numberFormat.format(nominaMes)} en nómina`
              : null}
          </Typography>
        </Card>
      </Box>
    </Box>
  )
}
