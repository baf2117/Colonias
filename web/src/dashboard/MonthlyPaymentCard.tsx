import type { ReactNode } from 'react'
import { Box, Button, Card, Chip, Stack, Typography } from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { Link, useGetList, useTranslate } from 'react-admin'
import { formatMonthName, useFormatLocale } from '../i18n/useFormatLocale'
import type { MyUnit } from './MyUnitSection'

type Payment = { id: number; status: 'pending' | 'approved' | 'rejected'; rejectionReason: string | null; amount: number }

// Tarjeta "Cuota de <mes>" del Panel general: el estado del pago del mes
// en curso de la unidad del usuario y, si falta, el acceso directo a
// cargar el comprobante (PaymentCreate). Lee /api/payments con
// filter.unitId + mes/año: a un residente puro el API ya lo acota a su
// unidad, y "el pago del mes" es el de Period = mes en curso (la cuota),
// no por fecha de pago.
export function MonthlyPaymentCard({ unit, fee, currency }: { unit: MyUnit; fee: number | null; currency: string | null }) {
  const translate = useTranslate()
  const formatLocale = useFormatLocale()
  const now = new Date()
  const { data: payments, isLoading } = useGetList<Payment>('payments', {
    pagination: { page: 1, perPage: 20 },
    sort: { field: 'createdAt', order: 'DESC' },
    filter: { unitId: unit.id, month: now.getMonth() + 1, year: now.getFullYear() },
  })

  if (isLoading) return null

  const month = formatMonthName(now, formatLocale)
  const approved = payments?.find((p) => p.status === 'approved')
  const pending = payments?.find((p) => p.status === 'pending')
  const rejected = !approved && !pending ? payments?.find((p) => p.status === 'rejected') : undefined
  const feeText = fee != null && currency ? new Intl.NumberFormat(formatLocale, { style: 'currency', currency }).format(fee) : null
  const t = (key: string, options?: Record<string, unknown>) => translate(`app.monthlyPayment.${key}`, { month, ...options })

  let chip: { label: string; color: string }
  let title: string
  let detail: string
  let action: ReactNode

  if (approved) {
    chip = { label: t('chipPaid'), color: 'success.main' }
    title = t('paidTitle')
    detail = t('paidDetail')
    action = (
      <Button component={Link} to={`/payments/${approved.id}/show`} variant="outlined">
        {t('viewPayment')}
      </Button>
    )
  } else if (pending) {
    chip = { label: t('chipInReview'), color: 'warning.main' }
    title = t('reviewTitle')
    detail = t('reviewDetail')
    action = (
      <Button component={Link} to={`/payments/${pending.id}/show`} variant="outlined">
        {t('viewOrChangeReceipt')}
      </Button>
    )
  } else if (rejected) {
    // Un rechazado se corrige cambiando el comprobante de ese mismo pago
    // (vuelve a "pendiente", ver ReplaceReceiptButton), no creando otro.
    chip = { label: t('chipRejected'), color: 'error.main' }
    title = t('rejectedTitle')
    detail = [rejected.rejectionReason ? t('rejectionReason', { reason: rejected.rejectionReason }) : null, t('rejectedDetail')]
      .filter(Boolean)
      .join(' ')
    action = (
      <Button component={Link} to={`/payments/${rejected.id}/show`} variant="contained" startIcon={<UploadFileIcon />}>
        {t('changeReceipt')}
      </Button>
    )
  } else {
    chip = { label: t('chipUnpaid'), color: 'warning.main' }
    title = t('unpaidTitle')
    detail = feeText ? t('unpaidDetailWithFee', { fee: feeText }) : t('unpaidDetail')
    action = (
      <Button component={Link} to="/payments/create" variant="contained" startIcon={<UploadFileIcon />}>
        {t('uploadReceipt')}
      </Button>
    )
  }

  return (
    <Card variant="outlined" sx={{ p: 2.5, mb: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 0.5, flexWrap: 'wrap', rowGap: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              {t('title')}
            </Typography>
            <Chip
              label={chip.label}
              size="small"
              variant="outlined"
              sx={{ borderRadius: 0, borderWidth: 2, borderColor: chip.color, color: chip.color, fontWeight: 600 }}
            />
          </Stack>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {detail}
          </Typography>
        </Box>
        <Box sx={{ flexShrink: 0 }}>{action}</Box>
      </Stack>
    </Card>
  )
}
