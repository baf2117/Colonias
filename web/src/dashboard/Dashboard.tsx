import { Box, Typography } from '@mui/material'
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

// Pantalla "Inicio". "Recaudado del mes" y "Gastos del mes" se sacaron a
// pedido del usuario: ese resumen ahora vive en Finanzas > Estado de
// cuentas (solo administradores). Queda el encabezado con el mes y la
// cantidad de unidades, y la unidad propia del usuario (MyUnitSection).
export default function Dashboard() {
  // perPage: 1 porque solo hace falta el total (viene en Content-Range).
  // /api/units está restringido a Administrador/SuperAdministrador (ver
  // api/Units.cs): para cualquier otro rol esto devuelve 403, así que la
  // cantidad de unidades simplemente no se muestra.
  const { total: unitsTotal, isLoading: unitsLoading, error: unitsError } = useGetList('units', {
    pagination: { page: 1, perPage: 1 },
    sort: { field: 'id', order: 'ASC' },
  })

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
    </Box>
  )
}
