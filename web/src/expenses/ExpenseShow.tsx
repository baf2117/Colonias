import {
  DateField,
  EditButton,
  Labeled,
  ReferenceField,
  Show,
  SimpleShowLayout,
  TextField,
  TopToolbar,
  useGetOne,
  useRecordContext,
  useTranslate,
} from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { useFormatLocale } from '../i18n/useFormatLocale'
import { ExpenseReceiptField } from './ExpenseReceiptField'

// El monto se formatea con la moneda real de la colonia del gasto,
// resuelta en dos saltos: Expense -> Vendor (vendorId) -> Neighborhood
// (vendor.neighborhoodId) -> currency. Mismo criterio que
// NeighborhoodFeeAmountField/UnitFeeAmountField (nunca una moneda fija
// en options={{ currency: '...' }}), un salto más porque acá la colonia
// no está directo en el registro sino a través del proveedor.
function ExpenseAmountField() {
  const record = useRecordContext<{ amount: number; vendorId: number }>()
  const formatLocale = useFormatLocale()
  const { data: vendor } = useGetOne(
    'vendors',
    { id: record?.vendorId },
    { enabled: !!record?.vendorId },
  )
  const { data: neighborhood } = useGetOne(
    'neighborhoods',
    { id: vendor?.neighborhoodId },
    { enabled: !!vendor?.neighborhoodId },
  )

  if (!record || !neighborhood) return null
  return <span>{new Intl.NumberFormat(formatLocale, { style: 'currency', currency: neighborhood.currency }).format(record.amount)}</span>
}

// Título con la categoría del gasto si tiene una, si no el nombre
// genérico del recurso.
function ExpenseShowTitle() {
  const record = useRecordContext<{ category?: string | null }>()
  const translate = useTranslate()
  return <AppPageTitle>{record?.category || translate('resources.expenses.name', { smart_count: 1 })}</AppPageTitle>
}

const ExpenseShowActions = () => (
  <TopToolbar>
    <EditButton />
  </TopToolbar>
)

// Misma pantalla de referencia que UnitShow (título + AppFormRow/
// AppFormCol de 12 columnas, solo lectura). <Labeled source="..."> en
// cada campo porque, al no ser hijos directos de SimpleShowLayout, no
// reciben el título automático que ese componente le pone a sus hijos.
export function ExpenseShow() {
  return (
    <Show actions={<ExpenseShowActions />}>
      <SimpleShowLayout>
        <ExpenseShowTitle />

        <AppFormRow>
          <AppFormCol span={5}>
            <Labeled source="vendorId">
              <ReferenceField source="vendorId" reference="vendors">
                <TextField source="name" />
              </ReferenceField>
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="category">
              <TextField source="category" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={4}>
            <Labeled source="date">
              <DateField source="date" />
            </Labeled>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={4}>
            <Labeled source="amount">
              <ExpenseAmountField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={4}>
            <Labeled source="description">
              <TextField source="description" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={4}>
            <Labeled label="app.common.receipt">
              <ExpenseReceiptField />
            </Labeled>
          </AppFormCol>
        </AppFormRow>
      </SimpleShowLayout>
    </Show>
  )
}
