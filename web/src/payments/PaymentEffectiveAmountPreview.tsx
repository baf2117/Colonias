import { Typography } from '@mui/material'
import { useGetOne } from 'react-admin'
import { useWatch } from 'react-hook-form'

// Vista previa de cuánto va a quedar registrado como Amount, mientras se
// elige la unidad en PaymentCreate — Amount nunca viaja en el POST (ver
// Payments.cs): el servidor lo fija a la cuota efectiva de la unidad
// (Units.FeeAmount si tiene, si no Neighborhoods.DefaultFeeAmount), así
// que acá se calcula lo mismo solo para mostrarlo, no para enviarlo.
// useWatch (de react-hook-form, la librería de formularios que usa
// react-admin por debajo) es lo que deja "escuchar" el valor de unitId
// sin convertir este componente en un input del formulario.
export function PaymentEffectiveAmountPreview() {
  const unitId = useWatch({ name: 'unitId' })
  const { data: unit } = useGetOne('units', { id: unitId }, { enabled: !!unitId })
  const { data: neighborhood } = useGetOne(
    'neighborhoods',
    { id: unit?.neighborhoodId },
    { enabled: !!unit?.neighborhoodId },
  )

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
