import {
  AutocompleteInput,
  BooleanInput,
  Create,
  ReferenceInput,
  required,
  SelectInput,
  SimpleForm,
  TextInput,
  useTranslate,
} from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'

// owner/tenant son los únicos valores que acepta el CHECK de
// dbo.Residents.RelationType.
const RELATION_TYPE_CHOICES = [
  { id: 'owner', name: 'Propietario' },
  { id: 'tenant', name: 'Inquilino' },
]

// Misma pantalla de referencia que UnitCreate (título + grilla de 12
// columnas). unitId es opcional — a diferencia de Units.neighborhoodId —
// porque un administrador o guardia "puro" no vive en ninguna unidad
// (ver schema.sql y el diagrama ER: la fusión de Users dentro de
// Residents es lo que volvió UnitId opcional). relationType solo tiene
// sentido cuando hay unidad, pero no se condiciona su visibilidad a
// propósito en esta primera versión — queda vacío si no aplica.
//
// Los cuatro roles son booleanos independientes y combinables (no un
// <SelectInput> de un solo valor): una misma persona puede ser
// Residente y Guardia a la vez, por ejemplo.
export function ResidentCreate() {
  const translate = useTranslate()
  return (
    <Create redirect="list">
      <SimpleForm>
        <AppPageTitle>{translate('resources.residents.name', { smart_count: 1 })}</AppPageTitle>

        <AppFormRow>
          <AppFormCol span={4}>
            <TextInput source="name" validate={required()} fullWidth />
          </AppFormCol>
          <AppFormCol span={4}>
            <TextInput source="phone" fullWidth />
          </AppFormCol>
          <AppFormCol span={4}>
            <TextInput source="email" fullWidth />
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={4}>
            <ReferenceInput source="unitId" reference="units">
              <AutocompleteInput optionText="identifier" fullWidth helperText="Vacío = sin unidad (administrador o guardia)" />
            </ReferenceInput>
          </AppFormCol>
          <AppFormCol span={4}>
            <SelectInput source="relationType" choices={RELATION_TYPE_CHOICES} fullWidth />
          </AppFormCol>
          <AppFormCol span={2}>
            <BooleanInput source="active" defaultValue={true} />
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
    </Create>
  )
}
