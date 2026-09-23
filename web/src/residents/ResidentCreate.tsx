import {
  AutocompleteInput,
  BooleanInput,
  Create,
  ReferenceInput,
  required,
  SimpleForm,
  TextInput,
  usePermissions,
  useTranslate,
} from 'react-admin'
import type { Permissions } from '../authProvider'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { canGrantSuperAdministrador } from '../components/RequireRole'

// Misma pantalla de referencia que UnitCreate (título + grilla de 12
// columnas). unitId es opcional — a diferencia de Units.neighborhoodId —
// porque un administrador "puro" no vive en ninguna unidad (ver
// schema.sql y el diagrama ER: la fusión de Users dentro de Residents
// es lo que volvió UnitId opcional). No se guarda ninguna relación tipo
// propietario/inquilino con la unidad — decisión explícita de no
// discriminar residentes por eso. Los guardias NO son Residents (ver
// web/src/security-staff).
//
// Los tres roles son booleanos independientes y combinables (no un
// <SelectInput> de un solo valor): una misma persona puede ser
// Residente y Administrador a la vez, por ejemplo.
export function ResidentCreate() {
  const translate = useTranslate()
  const { permissions } = usePermissions<Permissions>()
  const canGrantSuperAdmin = canGrantSuperAdministrador(permissions ?? null)
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
              <AutocompleteInput optionText="identifier" fullWidth helperText="app.residents.unitHelp" />
            </ReferenceInput>
          </AppFormCol>
          <AppFormCol span={2}>
            <BooleanInput source="active" defaultValue={true} />
          </AppFormCol>
          <AppFormCol span={4}>
            <BooleanInput
              source="receiveEmails"
              label="app.residents.receiveEmails"
              defaultValue={true}
              helperText="app.residents.receiveEmailsHelp"
            />
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={4}>
            <BooleanInput source="residente" />
          </AppFormCol>
          <AppFormCol span={4}>
            <BooleanInput source="administrador" />
          </AppFormCol>
          {/* Solo un SuperAdministrador puede otorgar este rol (ver
              RequireCanGrantSuperAdministrador en api/Residents.cs) --
              un Administrador ni siquiera ve el checkbox, en vez de
              verlo y que el guardado lo rechace. */}
          {canGrantSuperAdmin ? (
            <AppFormCol span={4}>
              <BooleanInput source="superAdministrador" />
            </AppFormCol>
          ) : null}
        </AppFormRow>

        {/* Colonia que este Administrador administra
            (dbo.Residents.NeighborhoodId, independiente de unitId) --
            solo un SuperAdministrador puede asignarla (ver
            RequireCanAssignNeighborhood en api/Residents.cs), mismo
            criterio que el checkbox de SuperAdministrador de arriba. */}
        {canGrantSuperAdmin ? (
          <AppFormRow>
            <AppFormCol span={6}>
              <ReferenceInput source="neighborhoodId" reference="neighborhoods">
                <AutocompleteInput
                  optionText="name"
                  label="app.residents.administeredNeighborhood"
                  fullWidth
                  helperText="app.residents.administeredNeighborhoodHelp"
                />
              </ReferenceInput>
            </AppFormCol>
          </AppFormRow>
        ) : null}
      </SimpleForm>
    </Create>
  )
}
