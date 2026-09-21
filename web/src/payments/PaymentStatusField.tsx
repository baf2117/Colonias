import { Chip, Typography } from '@mui/material'
import { useRecordContext } from 'react-admin'

// Mismo espíritu visual que EstadoCuota (dashboard), pero con el
// vocabulario real de Payments.Status (pending/approved/rejected, no
// pagado/vencido/pendiente): "approved" en tinta normal (es el estado
// esperado), "rejected" en rojo fuerte, "pending" como chip con borde en
// el color de acento de advertencia — misma rampa de color que ya usa el
// resto del panel, sin inventar un verde/ámbar aparte.
export function PaymentStatusField() {
  const record = useRecordContext<{ status: string }>()
  if (!record) return null

  if (record.status === 'approved') {
    return (
      <Typography variant="body2" color="text.primary">
        Aprobado
      </Typography>
    )
  }

  if (record.status === 'rejected') {
    return (
      <Typography variant="body2" fontWeight={600} color="error.main">
        Rechazado
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
