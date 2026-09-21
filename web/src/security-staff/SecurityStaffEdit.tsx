import {
  AutocompleteInput,
  BooleanInput,
  Edit,
  NumberInput,
  ReferenceInput,
  required,
  SimpleForm,
  TextInput,
  useRecordContext,
} from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'

function SecurityStaffEditTitle() {
  const record = useRecordContext()
  return <AppPageTitle>{record?.name ?? ''}</AppPageTitle>
}

// Mismo formulario que SecurityStaffCreate, precargado. Igual que en
// ResidentEdit, "Eliminar" puede chocar con una FK (AccessLog.GuardUserId);
// desactivar ("active") es la salida normal.
export function SecurityStaffEdit() {
  return (
    <Edit redirect="list">
      <SimpleForm>
        <SecurityStaffEditTitle />

        <AppFormRow>
          <AppFormCol span={2}>
            <BooleanInput source="active" />
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={4}>
            <TextInput source="name" validate={required()} fullWidth />
          </AppFormCol>
          <AppFormCol span={4}>
            <TextInput source="phone" fullWidth />
          </AppFormCol>
          <AppFormCol span={4}>
            <ReferenceInput source="neighborhoodId" reference="neighborhoods">
              <AutocompleteInput optionText="name" validate={required()} fullWidth />
            </ReferenceInput>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={4}>
            <NumberInput source="salary" label="Sueldo" fullWidth />
          </AppFormCol>
          <AppFormCol span={4}>
            <NumberInput source="bonuses" label="Bono" fullWidth />
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Edit>
  )
}
