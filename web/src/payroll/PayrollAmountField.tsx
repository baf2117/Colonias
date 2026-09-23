import type { FC } from 'react'
import { useGetOne, useRecordContext } from 'react-admin'
import { useFormatLocale } from '../i18n/useFormatLocale'

// El monto se formatea con la moneda real de la colonia del guardia,
// resuelta en dos saltos: Payroll -> SecurityStaff (staffId) ->
// Neighborhood (staff.neighborhoodId) -> currency. Mismo criterio que
// PaymentAmountField.tsx (ahí es Payment -> Unit -> Neighborhood).
//
// Se usa tanto en PayrollShow como en PayrollEdit: en los dos casos es
// solo lectura, porque Amount no es un valor que el administrador pueda
// tocar — es Salary + Bonuses del guardia al momento de crear el pago,
// fijado del lado del servidor (ver GetEffectivePayrollAmountAsync en
// Payroll.cs) y ya no editable después. Para elegir el guardia antes de
// crear el pago, ver PayrollEffectiveAmountPreview (PayrollCreate.tsx).
export const PayrollAmountField: FC<{ label?: string }> = () => {
  const record = useRecordContext<{ amount: number; staffId: number }>()
  const formatLocale = useFormatLocale()
  const { data: staff } = useGetOne(
    'security-staff',
    { id: record?.staffId },
    { enabled: !!record?.staffId },
  )
  const { data: neighborhood } = useGetOne(
    'neighborhoods',
    { id: staff?.neighborhoodId },
    { enabled: !!staff?.neighborhoodId },
  )

  if (!record || !neighborhood) return null
  return <span>{new Intl.NumberFormat(formatLocale, { style: 'currency', currency: neighborhood.currency }).format(record.amount)}</span>
}
