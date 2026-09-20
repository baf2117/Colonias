import {
  AutocompleteInput,
  BooleanInput,
  Create,
  ReferenceInput,
  required,
  SimpleForm,
  TextInput,
  useTranslate,
} from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'

// Misma pantalla de referencia que UnitCreate (título + grilla de 12
// columnas). unitId es opcional — a diferencia de Units.neighborhoodId —
// porque un administrador o guardia "puro" no vive en ninguna unidad
// (ver schema.sql y el diagrama ER: la fusión de Users dentro de
// Residents es lo que volvió UnitId opcional). No se guarda ninguna
// relación tipo propietario/inquilino con la unidad — decisión
// explícita de no discriminar residentes por eso.
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
          <AppFormCol span={6}>
            <ReferenceInput source="unitId" reference="units">
              <AutocompleteInput optionText="identifier" fullWidth helperText="Vacío = sin unidad (administrador o guardia)" />
            </ReferenceInput>
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
