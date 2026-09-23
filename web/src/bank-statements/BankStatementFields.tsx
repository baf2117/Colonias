import type { FC } from 'react'
import { useGetOne, useRecordContext } from 'react-admin'
import { useFormatLocale } from '../i18n/useFormatLocale'

// Nombre de la colonia del registro con useGetOne, no con ReferenceField:
// GetNeighborhoods (api/Neighborhoods.cs) todavía no soporta filter.id, así
// que el getMany de un ReferenceField devolvería solo las primeras 10.
export const BankStatementNeighborhoodField: FC<{ label?: string }> = () => {
  const record = useRecordContext<{ neighborhoodId: number }>()
  const { data: neighborhood } = useGetOne(
    'neighborhoods',
    { id: record?.neighborhoodId },
    { enabled: !!record?.neighborhoodId },
  )
  return <span>{neighborhood?.name ?? ''}</span>
}

// Saldo con la moneda real de la colonia (Neighborhoods.Currency), mismo
// criterio que ExpenseAmountField.
export const BankStatementBalanceField: FC<{ label?: string }> = () => {
  const record = useRecordContext<{ bankBalance: number; neighborhoodId: number }>()
  const formatLocale = useFormatLocale()
  const { data: neighborhood } = useGetOne(
    'neighborhoods',
    { id: record?.neighborhoodId },
    { enabled: !!record?.neighborhoodId },
  )
  if (record?.bankBalance == null) return null
  if (!neighborhood?.currency) {
    return <span>{record.bankBalance.toFixed(2)}</span>
  }
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {new Intl.NumberFormat(formatLocale, { style: 'currency', currency: neighborhood.currency }).format(record.bankBalance)}
    </span>
  )
}
