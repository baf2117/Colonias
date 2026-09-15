import {
  Box,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Chip,
  Link as MuiLink,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Title } from 'react-admin'
import { EstadoCuota } from '../components/EstadoCuota'
import { cobrosDelMes, panelHeader } from '../dashboard/sampleData'

// Pantalla "Cuotas y pagos" — cascarón visual calcado del Design, con
// datos de ejemplo (las mismas 5 filas del panel, repetidas: alcanza para
// probar el layout). Cuando exista el endpoint GET /api/fees con
// filtros por periodo/estado/bloque, esto pasa a ser un <List> real de
// react-admin en vez de una tabla estática.
export default function FeesShell() {
  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Title title="Cuotas y pagos" />

      <Breadcrumbs sx={{ mb: 1, fontSize: '0.8rem' }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
          Inicio
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
          Finanzas
        </Typography>
        <Typography variant="caption" color="text.primary" fontWeight={600} sx={{ textTransform: 'uppercase' }}>
          Cuotas y pagos
        </Typography>
      </Breadcrumbs>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Typography variant="h4" component="h1" fontWeight={700}>
          Cuotas y pagos
        </Typography>
        <Stack direction="row" spacing={1.5}>
          <Button variant="outlined" color="inherit" sx={{ borderWidth: 2 }}>
            Exportar
          </Button>
          <Button variant="outlined" color="inherit" sx={{ borderWidth: 2 }}>
            Generar cargos del mes
          </Button>
          <Button variant="contained" color="primary">
            Registrar pago
          </Button>
        </Stack>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2.5 }}>
        <TextField select size="small" label="Periodo" defaultValue={panelHeader.periodo} sx={{ minWidth: 180 }}>
          <MenuItem value={panelHeader.periodo}>{panelHeader.periodo}</MenuItem>
        </TextField>
        <TextField select size="small" label="Estado" defaultValue="todos" sx={{ minWidth: 160 }}>
          <MenuItem value="todos">Todos</MenuItem>
          <MenuItem value="pagado">Pagado</MenuItem>
          <MenuItem value="vencido">Vencido</MenuItem>
          <MenuItem value="pendiente">Pendiente</MenuItem>
        </TextField>
        <TextField select size="small" label="Bloque" defaultValue="todos" sx={{ minWidth: 160 }}>
          <MenuItem value="todos">Todos</MenuItem>
        </TextField>
        <TextField size="small" label="Buscar" placeholder="Unidad o residente" sx={{ flex: 1 }} />
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          148 cargos · 23 vencidos · $1.364.000 por cobrar
        </Typography>
        <Stack direction="row" spacing={1}>
          <Chip label="Vencido 23" size="small" variant="outlined" sx={{ borderRadius: 0, borderWidth: 2, borderColor: 'error.main', color: 'error.main', fontWeight: 600 }} />
          <Chip label="Pagado 101" size="small" variant="outlined" sx={{ borderRadius: 0, borderWidth: 2 }} />
          <Chip label="Pendiente 24" size="small" variant="outlined" sx={{ borderRadius: 0, borderWidth: 2, borderColor: 'warning.main', color: 'warning.main', fontWeight: 600 }} />
        </Stack>
      </Stack>

      <Card variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox size="small" />
              </TableCell>
              <TableCell sx={{ textTransform: 'uppercase', fontSize: '0.72rem', color: 'text.secondary' }}>Unidad</TableCell>
              <TableCell sx={{ textTransform: 'uppercase', fontSize: '0.72rem', color: 'text.secondary' }}>Residente</TableCell>
              <TableCell sx={{ textTransform: 'uppercase', fontSize: '0.72rem', color: 'text.secondary' }}>Concepto</TableCell>
              <TableCell sx={{ textTransform: 'uppercase', fontSize: '0.72rem', color: 'text.secondary' }}>Monto</TableCell>
              <TableCell sx={{ textTransform: 'uppercase', fontSize: '0.72rem', color: 'text.secondary' }}>Vence</TableCell>
              <TableCell sx={{ textTransform: 'uppercase', fontSize: '0.72rem', color: 'text.secondary' }}>Estado</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {cobrosDelMes.map((cargo) => (
              <TableRow key={`${cargo.unidad}-${cargo.residente}`}>
                <TableCell padding="checkbox">
                  <Checkbox size="small" />
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{cargo.unidad}</TableCell>
                <TableCell>{cargo.residente}</TableCell>
                <TableCell>{cargo.concepto}</TableCell>
                <TableCell>{cargo.monto}</TableCell>
                <TableCell>05 sep</TableCell>
                <TableCell>
                  <EstadoCuota estado={cargo.estado} />
                </TableCell>
                <TableCell align="right">
                  <MuiLink component="button" underline="hover" variant="body2" fontWeight={600} color={cargo.estado === 'vencido' ? 'error.main' : 'primary'}>
                    {cargo.estado === 'vencido' ? 'Cobrar' : 'Ver'}
                  </MuiLink>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
        1–{cobrosDelMes.length} de 148
      </Typography>
    </Box>
  )
}
