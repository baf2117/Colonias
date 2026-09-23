import type { FC } from 'react'
import { useRecordContext } from 'react-admin'
import { formatMonthYear, useFormatLocale } from '../i18n/useFormatLocale'

// Period es siempre el día 1 del mes que cubre el pago (lo normaliza
// api/Payroll.cs sin importar qué día venga del formulario) — mismo
// criterio que PaymentPeriodField.tsx.
export const PayrollPeriodField: FC<{ label?: string }> = () => {
  const record = useRecordContext<{ period: string }>()
  const formatLocale = useFormatLocale()
  if (!record?.period) return null
  return <span>{formatMonthYear(new Date(record.period), formatLocale)}</span>
}
