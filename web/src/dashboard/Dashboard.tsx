import {
  Box,
  Card,
  Divider,
  LinearProgress,
  Link as MuiLink,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { Title } from 'react-admin'
import { AppButton } from '../components/AppButton'
import { EstadoCuota } from '../components/EstadoCuota'
import {
  actividadReciente,
  cobrosDelMes,
  kpis,
  panelHeader,
  presupuestoAnual,
} from './sampleData'

// Pantalla "Inicio" — cascarón visual calcado del Design (Panel general),
// con datos de ejemplo. Todavía no hay endpoint de resumen en la API: los
// números de acá se reemplazan por datos reales el día que exista
// GET /api/dashboard (o equivalente), sin tocar el layout.
export default function Dashboard() {
  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Title title="Panel general" />

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ sm: 'flex-end' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" component="h1" fontWeight={700}>
            Panel general
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {panelHeader.periodo.toUpperCase()} · {panelHeader.unidades} UNIDADES
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <AppButton variant="outlined" color="inherit" sx={{ borderWidth: 2 }}>
            Exportar
          </AppButton>
          <AppButton variant="contained" color="primary">
            Registrar pago
          </AppButton>
        </Stack>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        {kpis.map((kpi) => (
          <Card key={kpi.label} variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="body2" color="text.secondary">
              {kpi.label}
            </Typography>
            <Typography
              variant="h4"
              fontWeight={700}
              sx={{ mt: 1, color: kpi.tone === 'critical' ? 'error.main' : 'text.primary' }}
            >
              {kpi.value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {kpi.detail}
            </Typography>
          </Card>
        ))}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <Card variant="outlined">
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 2.5, pb: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Cobros del mes
            </Typography>
            <MuiLink component="button" underline="hover" color="primary" variant="body2" fontWeight={600}>
              Ver todos
            </MuiLink>
          </Stack>
          <Divider sx={{ borderBottomWidth: 2 }} />
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ textTransform: 'uppercase', fontSize: '0.72rem', color: 'text.secondary' }}>Unidad</TableCell>
                <TableCell sx={{ textTransform: 'uppercase', fontSize: '0.72rem', color: 'text.secondary' }}>Residente</TableCell>
                <TableCell sx={{ textTransform: 'uppercase', fontSize: '0.72rem', color: 'text.secondary' }}>Concepto</TableCell>
                <TableCell sx={{ textTransform: 'uppercase', fontSize: '0.72rem', color: 'text.secondary' }}>Monto</TableCell>
                <TableCell sx={{ textTransform: 'uppercase', fontSize: '0.72rem', color: 'text.secondary' }}>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cobrosDelMes.map((cargo) => (
                <TableRow key={`${cargo.unidad}-${cargo.residente}`}>
                  <TableCell sx={{ fontWeight: 600 }}>{cargo.unidad}</TableCell>
                  <TableCell>{cargo.residente}</TableCell>
                  <TableCell>{cargo.concepto}</TableCell>
                  <TableCell>{cargo.monto}</TableCell>
                  <TableCell>
                    <EstadoCuota estado={cargo.estado} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Stack spacing={2}>
          <Card variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Actividad reciente
            </Typography>
            <Stack spacing={1.75} divider={<Divider sx={{ borderBottomWidth: 2 }} />}>
              {actividadReciente.map((item) => (
                <Box key={item.titulo}>
                  <Typography variant="body2" fontWeight={600}>
                    {item.titulo}
                  </Typography>
                  {item.detalle && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {item.detalle}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {item.cuando}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Card>

          <Card variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Presupuesto del año
            </Typography>
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 1.5, mb: 0.75 }}>
              <Typography variant="body2" color="text.secondary">
                Ejecutado
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {presupuestoAnual.ejecutadoPct}%
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={presupuestoAnual.ejecutadoPct}
              sx={{ height: 8, borderRadius: 0, backgroundColor: 'action.hover' }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
              {presupuestoAnual.ejecutado} de {presupuestoAnual.total} anuales
            </Typography>
          </Card>
        </Stack>
      </Box>
    </Box>
  )
}
