import { useGetOne, usePermissions, useRecordContext } from 'react-admin'
import type { Permissions } from '../authProvider'
import { isPureResident } from '../components/RequireRole'
import { useMyUnit } from '../dashboard/MyUnitSection'
import { useFormatLocale } from '../i18n/useFormatLocale'

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
//
// Bug corregido: GET /api/units/{id} está bloqueado del todo para un
// residente puro (ver "Permisos por rol" en el documento de
// arquitectura), así que el useGetOne('units', ...) de abajo nunca
// resolvía y el monto no se mostraba nunca en PaymentShow para ese rol.
// Un residente puro solo puede ver pagos de su propia unidad (GetOne ya
// se lo garantiza por fila), así que para él se resuelve el
// neighborhoodId con useMyUnit() (GET /api/units/mine, de autoservicio)
// en vez de useGetOne('units', ...) — mismo patrón que ya usa
// PaymentEffectiveAmountPreview.tsx.
export function PaymentAmountField() {
  const record = useRecordContext<{ amount: number; unitId: number }>()
  const { permissions } = usePermissions<Permissions>()
  const isResident = isPureResident(permissions ?? null)
  const formatLocale = useFormatLocale()

  const { unit: myUnit } = useMyUnit()
  const { data: unit } = useGetOne(
    'units',
    { id: record?.unitId },
    { enabled: !isResident && !!record?.unitId },
  )
  const neighborhoodId = isResident ? myUnit?.neighborhoodId : unit?.neighborhoodId
  const { data: neighborhood } = useGetOne(
    'neighborhoods',
    { id: neighborhoodId },
    { enabled: !!neighborhoodId },
  )

  if (!record || !neighborhood) return null
  return <span>{new Intl.NumberFormat(formatLocale, { style: 'currency', currency: neighborhood.currency }).format(record.amount)}</span>
}
