import type { FC } from 'react'
import { Chip } from '@mui/material'
import { useRecordContext, useTranslate } from 'react-admin'

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
// El texto de cada estado sale de app.paymentStatus.<estado>.
const STATUS_COLORS: Record<string, string> = {
  pending: 'warning.main',
  approved: 'success.main',
  rejected: 'error.main',
}

export const PaymentStatusField: FC<{ label?: string }> = () => {
  const record = useRecordContext<{ status: string }>()
  const translate = useTranslate()
  if (!record) return null

  const color = STATUS_COLORS[record.status]
  if (!color) return null
  const config = { label: translate(`app.paymentStatus.${record.status}`), color }

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
