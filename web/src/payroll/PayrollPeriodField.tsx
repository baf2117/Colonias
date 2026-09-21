import { useRecordContext } from 'react-admin'

// Period es siempre el día 1 del mes que cubre el pago (lo normaliza
// api/Payroll.cs sin importar qué día venga del formulario) — mismo
// criterio que PaymentPeriodField.tsx.
export function PayrollPeriodField() {
  const record = useRecordContext<{ period: string }>()
  if (!record?.period) return null
  const formatted = new Intl.DateTimeFormat('es-GT', { year: 'numeric', month: 'long' }).format(new Date(record.period))
  return <span style={{ textTransform: 'capitalize' }}>{formatted}</span>
}
