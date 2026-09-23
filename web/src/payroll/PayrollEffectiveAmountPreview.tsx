import { Typography } from '@mui/material'
import { useGetOne, useTranslate } from 'react-admin'
import { useFormatLocale } from '../i18n/useFormatLocale'
import { useWatch } from 'react-hook-form'

// Vista previa de cuánto va a quedar registrado como Amount, mientras se
// elige el guardia en PayrollCreate — Amount nunca viaja en el POST (ver
// Payroll.cs): el servidor lo fija a Salary + Bonuses del guardia, así
// que acá se calcula lo mismo solo para mostrarlo, no para enviarlo.
// Mismo criterio que PaymentEffectiveAmountPreview.tsx.
export function PayrollEffectiveAmountPreview() {
  const staffId = useWatch({ name: 'staffId' })
  const translate = useTranslate()
  const formatLocale = useFormatLocale()
  const { data: staff } = useGetOne('security-staff', { id: staffId }, { enabled: !!staffId })
  const { data: neighborhood } = useGetOne(
    'neighborhoods',
    { id: staff?.neighborhoodId },
    { enabled: !!staff?.neighborhoodId },
  )

  if (!staffId) {
    return (
      <Typography variant="body2" color="text.secondary">
        {translate('app.payroll.chooseGuard')}
      </Typography>
    )
  }
  if (!staff || !neighborhood) return null

  const amount = staff.salary + staff.bonuses
  return <span>{new Intl.NumberFormat(formatLocale, { style: 'currency', currency: neighborhood.currency }).format(amount)}</span>
}
