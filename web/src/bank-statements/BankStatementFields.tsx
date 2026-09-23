import { useGetOne, useRecordContext } from 'react-admin'

// Nombre de la colonia del registro con useGetOne, no con ReferenceField:
// GetNeighborhoods (api/Neighborhoods.cs) todavía no soporta filter.id, así
// que el getMany de un ReferenceField devolvería solo las primeras 10.
export function BankStatementNeighborhoodField() {
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
export function BankStatementBalanceField() {
  const record = useRecordContext<{ bankBalance: number; neighborhoodId: number }>()
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
      {new Intl.NumberFormat('es-GT', { style: 'currency', currency: neighborhood.currency }).format(record.bankBalance)}
    </span>
  )
}
