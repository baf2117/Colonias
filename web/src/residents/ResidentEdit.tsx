import {
  AutocompleteInput,
  BooleanInput,
  Edit,
  ReferenceInput,
  required,
  SimpleForm,
  TextInput,
  useRecordContext,
} from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'

// Título con el nombre real del residente, igual que UnitEdit usa el
// identificador real de la unidad.
function ResidentEditTitle() {
  const record = useRecordContext()
  return <AppPageTitle>{record?.name ?? ''}</AppPageTitle>
}

// Mismo formulario que ResidentCreate, precargado. El toolbar por
// defecto de SimpleForm en un <Edit> ya trae "Eliminar" además de
// "Guardar" — pero borrar puede chocar con una FK (pagos, códigos de
// acceso, etc. que referencian a este residente); ver el catch en
// api/Residents.cs. Desactivar (el campo "active") es la salida normal.
export function ResidentEdit() {
  return (
    <Edit redirect="list">
      <SimpleForm>
        <ResidentEditTitle />
        <AppFormRow>

          <AppFormCol span={2}>
            <BooleanInput source="active" />
          </AppFormCol>
        </AppFormRow>
        <AppFormRow>
          <AppFormCol span={3}>
            <TextInput source="name" validate={required()} fullWidth />
          </AppFormCol>
          <AppFormCol span={3}>
            <TextInput source="phone" fullWidth />
          </AppFormCol>
          <AppFormCol span={3}>
            <TextInput source="email" fullWidth />
          </AppFormCol>
          <AppFormCol span={3}>
            <ReferenceInput source="unitId" reference="units">
              <AutocompleteInput optionText="identifier" fullWidth helperText="Vacío = sin unidad (administrador o guardia)" />
            </ReferenceInput>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={3}>
            <BooleanInput source="residente" />
          </AppFormCol>
          <AppFormCol span={3}>
            <BooleanInput source="guardia" />
          </AppFormCol>
          <AppFormCol span={3}>
            <BooleanInput source="administrador" />
          </AppFormCol>
          <AppFormCol span={3}>
            <BooleanInput source="superAdministrador" />
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Edit>
  )
}
