import type { FC } from 'react'
import { useRecordContext } from 'react-admin'
import { formatMonthYear, useFormatLocale } from '../i18n/useFormatLocale'

// Period es siempre el día 1 del mes que cubre el pago (lo normaliza
// api/Payments.cs sin importar qué día venga del formulario) — mostrarlo
// con un DateField se vería como "01/09/2026", que sugiere un día
// puntual que no existe. Se muestra directo como "Septiembre 2026".
export const PaymentPeriodField: FC<{ label?: string }> = () => {
  const record = useRecordContext<{ period: string }>()
  const formatLocale = useFormatLocale()
  if (!record?.period) return null
  return <span>{formatMonthYear(new Date(record.period), formatLocale)}</span>
}
