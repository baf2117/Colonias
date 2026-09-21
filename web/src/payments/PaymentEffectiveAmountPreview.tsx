import { Typography } from '@mui/material'
import { useGetOne, usePermissions } from 'react-admin'
import { useWatch } from 'react-hook-form'
import type { Permissions } from '../authProvider'
import { isPureResident } from '../components/RequireRole'
import { useMyUnit } from '../dashboard/MyUnitSection'

// Vista previa de cuánto va a quedar registrado como Amount, mientras se
// elige la unidad en PaymentCreate — Amount nunca viaja en el POST (ver
// Payments.cs): el servidor lo fija a la cuota efectiva de la unidad
// (Units.FeeAmount si tiene, si no Neighborhoods.DefaultFeeAmount), así
// que acá se calcula lo mismo solo para mostrarlo, no para enviarlo.
// useWatch (de react-hook-form, la librería de formularios que usa
// react-admin por debajo) es lo que deja "escuchar" el valor de unitId
// sin convertir este componente en un input del formulario.
//
// Un residente puro no tiene un campo de Unidad en el formulario (ver
// PaymentCreate.tsx): no hay nada que "escuchar" con useWatch. Para ese
// caso se usa useMyUnit() (el mismo hook que ya alimenta "Mi unidad" en
// el Panel general, GET /api/units/mine) para calcular la cuota de SU
// PROPIA unidad — exactamente la que api/Payments.cs va a usar del lado
// del servidor, porque ahí también la fuerza a partir de GetCurrentUser()
// en vez de leerla del body.
export function PaymentEffectiveAmountPreview() {
  const { permissions } = usePermissions<Permissions>()
  const isResident = isPureResident(permissions ?? null)

  const watchedUnitId = useWatch({ name: 'unitId' })
  const { unit: myUnit, isLoading: isLoadingMyUnit } = useMyUnit()

  const unitId = isResident ? myUnit?.id : watchedUnitId
  const neighborhoodId = isResident ? myUnit?.neighborhoodId : undefined

  const { data: unit } = useGetOne('units', { id: unitId }, { enabled: !isResident && !!unitId })
  const { data: neighborhood } = useGetOne(
    'neighborhoods',
    { id: isResident ? neighborhoodId : unit?.neighborhoodId },
    { enabled: !!(isResident ? neighborhoodId : unit?.neighborhoodId) },
  )

  if (isResident) {
    if (isLoadingMyUnit) return null
    if (!myUnit || !neighborhood) return null
    const amount = myUnit.feeAmount ?? neighborhood.defaultFeeAmount
    return <span>{new Intl.NumberFormat('es-GT', { style: 'currency', currency: neighborhood.currency }).format(amount)}</span>
  }

  if (!unitId) {
    return (
      <Typography variant="body2" color="text.secondary">
        Elegí una unidad para ver la cuota
      </Typography>
    )
  }
  if (!unit || !neighborhood) return null

  const amount = unit.feeAmount ?? neighborhood.defaultFeeAmount
  return <span>{new Intl.NumberFormat('es-GT', { style: 'currency', currency: neighborhood.currency }).format(amount)}</span>
}
