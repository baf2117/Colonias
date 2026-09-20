import {
  AutocompleteInput,
  DateInput,
  Edit,
  NumberInput,
  ReferenceInput,
  required,
  SimpleForm,
  TextInput,
  useRecordContext,
  useTranslate,
} from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { CreateVendorDialog } from '../vendors/CreateVendorDialog'

// Título con la categoría del gasto si tiene una, si no el nombre
// genérico del recurso — igual de espíritu que UnitEdit (usa el
// identificador real cuando hay uno disponible).
function ExpenseEditTitle() {
  const record = useRecordContext<{ category?: string | null }>()
  const translate = useTranslate()
  return <AppPageTitle>{record?.category || translate('resources.expenses.name', { smart_count: 1 })}</AppPageTitle>
}

// Mismo formulario que ExpenseCreate, precargado con los valores
// actuales. El toolbar por defecto de SimpleForm en un <Edit> ya trae
// el botón "Eliminar" además de "Guardar".
export function ExpenseEdit() {
  return (
    <Edit redirect="list">
      <SimpleForm>
        <ExpenseEditTitle />

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
            <DateInput source="date" validate={required()} fullWidth />
          </AppFormCol>
          <AppFormCol span={9}>
            <TextInput source="description" multiline fullWidth />
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Edit>
  )
}
