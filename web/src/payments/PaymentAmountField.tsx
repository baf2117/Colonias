import { useGetOne, useRecordContext } from 'react-admin'

// El monto se formatea con la moneda real de la colonia de la unidad que
// paga, resuelta en dos saltos: Payment -> Unit (unitId) -> Neighborhood
// (unit.neighborhoodId) -> currency. Mismo criterio que ExpenseAmountField.
//
// Se usa tanto en PaymentShow como en PaymentEdit: en los dos casos es
// solo lectura, porque Amount no es un valor que el administrador pueda
// tocar — es la cuota efectiva de la unidad (Units.FeeAmount si tiene,
// si no Neighborhoods.DefaultFeeAmount) al momento de crear el pago,
// fijada del lado del servidor (ver GetEffectiveFeeAsync en Payments.cs)
// y ya no editable después. Para elegir la unidad antes de crear el
// pago, ver PaymentEffectiveAmountPreview (PaymentCreate.tsx).
export function PaymentAmountField() {
  const record = useRecordContext<{ amount: number; unitId: number }>()
  const { data: unit } = useGetOne(
    'units',
    { id: record?.unitId },
    { enabled: !!record?.unitId },
  )
  const { data: neighborhood } = useGetOne(
    'neighborhoods',
    { id: unit?.neighborhoodId },
    { enabled: !!unit?.neighborhoodId },
  )

  if (!record || !neighborhood) return null
  return <span>{new Intl.NumberFormat('es-GT', { style: 'currency', currency: neighborhood.currency }).format(record.amount)}</span>
}
