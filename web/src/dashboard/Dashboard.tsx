import { Box, Typography } from '@mui/material'
import { Title, useGetList, useTranslate } from 'react-admin'
import { formatMonthYear, useFormatLocale } from '../i18n/useFormatLocale'
import { MyUnitSection } from './MyUnitSection'

// Pantalla "Inicio". "Recaudado del mes" y "Gastos del mes" se sacaron a
// pedido del usuario: ese resumen ahora vive en Finanzas > Estado de
// cuentas (solo administradores). Queda el encabezado con el mes en curso
// (del reloj del navegador, en el idioma elegido) y la cantidad de
// unidades, y la unidad propia del usuario (MyUnitSection).
export default function Dashboard() {
  const translate = useTranslate()
  const formatLocale = useFormatLocale()

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
      <Title title={translate('app.dashboard.title')} />

      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          {translate('app.dashboard.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {formatMonthYear(new Date(), formatLocale).toUpperCase()}
          {!unitsLoading && !unitsError && typeof unitsTotal === 'number'
            ? ` · ${translate('app.dashboard.unitsCount', { smart_count: unitsTotal })}`
            : null}
        </Typography>
      </Box>

      {/* Solo se ve si el usuario actual tiene una unidad asignada (ver
          MyUnitSection.tsx / GET /api/units/mine) — un guardia o un
          residente sin unidad no ven nada acá. */}
      <MyUnitSection />
    </Box>
  )
}
