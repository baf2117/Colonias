import { Chip, Typography } from '@mui/material'
import type { EstadoCargo } from '../dashboard/sampleData'

// "Pagado" es el estado esperado: no necesita color, solo tinta normal.
// "Vencido" toma el rojo 700 (suficiente contraste como texto) y
// "pendiente" un chip con borde en el rojo 500 — la misma rampa de acento
// única que usa el resto del panel, sin inventar un verde/ámbar aparte.
export function EstadoCuota({ estado }: { estado: EstadoCargo }) {
  if (estado === 'pagado') {
    return (
      <Typography variant="body2" color="text.primary">
        Pagado
      </Typography>
    )
  }

  if (estado === 'vencido') {
    return (
      <Typography variant="body2" color="error.main" sx={{ fontWeight: 600 }}>
        Vencido
      </Typography>
    )
  }

  return (
    <Chip
      label="Pendiente"
      size="small"
      variant="outlined"
      sx={{
        borderRadius: 0,
        borderWidth: 2,
        borderColor: 'warning.main',
        color: 'warning.main',
        fontWeight: 600,
      }}
    />
  )
}
