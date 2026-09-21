import { useRecordContext } from 'react-admin'

// Period es siempre el día 1 del mes que cubre el pago (lo normaliza
// api/Payments.cs sin importar qué día venga del formulario) — mostrarlo
// con un DateField se vería como "01/09/2026", que sugiere un día
// puntual que no existe. Se muestra directo como "Septiembre 2026".
export function PaymentPeriodField() {
  const record = useRecordContext<{ period: string }>()
  if (!record?.period) return null
  const formatted = new Intl.DateTimeFormat('es-GT', { year: 'numeric', month: 'long' }).format(new Date(record.period))
  return <span style={{ textTransform: 'capitalize' }}>{formatted}</span>
}
