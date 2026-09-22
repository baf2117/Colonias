import { AutocompleteInput, Create, DateInput, Labeled, NumberInput, ReferenceInput, required, SimpleForm, TextInput, useTranslate } from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { CreateVendorDialog } from '../vendors/CreateVendorDialog'
import { ExpenseReceiptUploadInput } from './ExpenseReceiptUploadInput'

// Mismo patrón de referencia (título + grilla de 12 columnas) que
// UnitCreate/NeighborhoodCreate. dbo.Expenses.VendorId es NOT NULL —
// todo gasto tiene un proveedor, y la colonia del gasto se resuelve a
// través del proveedor (Vendors.NeighborhoodId) — así que el selector
// es obligatorio. El prop `create` de AutocompleteInput es lo que deja
// dar de alta un proveedor nuevo sin salir de este formulario (ver
// vendors/CreateVendorDialog.tsx) cuando el que se busca no existe
// todavía, en vez de mandar a una pantalla de "Proveedores" aparte.
//
// RegisteredByUserId no aparece en este formulario: el API lo resuelve
// del lado del servidor a partir del usuario autenticado (ver
// Expenses.cs), nunca viaja en el body.
//
// Comprobante (receiptBlobPath) es obligatorio -- a pedido del usuario,
// a diferencia de Payments -- ver ExpenseReceiptUploadInput.tsx y la
// validación espejo en CreateExpense (api/Expenses.cs).
export function ExpenseCreate() {
  const translate = useTranslate()
  return (
    <Create redirect="list">
      <SimpleForm>
        <AppPageTitle>{translate('resources.expenses.name', { smart_count: 1 })}</AppPageTitle>

        <AppFormRow>
          <AppFormCol span={5}>
            <ReferenceInput source="vendorId" reference="vendors">
              <AutocompleteInput optionText="name" validate={required()} create={<CreateVendorDialog />} fullWidth />
            </ReferenceInput>
          </AppFormCol>
          <AppFormCol span={3}>
            <TextInput source="category" fullWidth />
          </AppFormCol>
          <AppFormCol span={4}>
            <NumberInput source="amount" validate={required()} fullWidth />
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={3}>
            <DateInput source="date" validate={required()} defaultValue={new Date().toISOString().slice(0, 10)} fullWidth />
          </AppFormCol>
          <AppFormCol span={5}>
            <TextInput source="description" multiline fullWidth />
          </AppFormCol>
          <AppFormCol span={4}>
            <Labeled label="Comprobante">
              <ExpenseReceiptUploadInput source="receiptBlobPath" validate={required()} />
            </Labeled>
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Create>
  )
}
