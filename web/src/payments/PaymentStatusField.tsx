import { Chip } from '@mui/material'
import { useRecordContext } from 'react-admin'

// Los tres estados de Payments.Status comparten el mismo look (chip sin
// relleno, borde de 2px y texto en negrita, ambos en el color del
// estado) -- antes solo "pending" tenía este tratamiento (ver el
// historial: "approved" era texto plano sin color y "rejected" texto en
// negrita sin el chip), a pedido explícito del usuario de unificar los
// tres. Los colores salen de la paleta (theme.ts), nada hardcodeado acá:
// - pending: warning.main -- el rojo claro de la rampa, como ya estaba.
// - approved: success.main -- el único verde de toda la paleta
//   "Modernist" (una excepción deliberada al acento único de rojo, ver
//   el comentario de theme.ts), a pedido del usuario.
// - rejected: error.main -- el rojo más oscuro/intenso de la rampa
//   (más intenso que el de pending), como ya estaba, pero ahora en chip
//   en vez de texto plano.
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'warning.main' },
  approved: { label: 'Aprobado', color: 'success.main' },
  rejected: { label: 'Rechazado', color: 'error.main' },
}

export function PaymentStatusField() {
  const record = useRecordContext<{ status: string }>()
  if (!record) return null

  const config = STATUS_CONFIG[record.status]
  if (!config) return null

  return (
    <Chip
      label={config.label}
      size="small"
      variant="outlined"
      sx={{
        borderRadius: 0,
        borderWidth: 2,
        borderColor: config.color,
        color: config.color,
        fontWeight: 600,
      }}
    />
  )
}
