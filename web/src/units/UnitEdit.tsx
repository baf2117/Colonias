import {
  AutocompleteInput,
  BooleanInput,
  Edit,
  NumberInput,
  ReferenceInput,
  required,
  SimpleForm,
  TextInput,
  usePermissions,
  useRecordContext,
} from 'react-admin'
import type { Permissions } from '../authProvider'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { isSuperAdministrador } from '../components/RequireRole'

// Título con el identificador real de la unidad (no "Unidad" genérico),
// igual que NeighborhoodShow usa el nombre real de la colonia.
function UnitEditTitle() {
  const record = useRecordContext()
  return <AppPageTitle>{record?.identifier ?? ''}</AppPageTitle>
}

// Primera pantalla de Edit del proyecto: mismo formulario que
// UnitCreate (título + grilla de 12 columnas, mismos tamaños de columna),
// precargado con los valores actuales. El toolbar por defecto de
// SimpleForm en un <Edit> ya trae el botón "Eliminar" además de
// "Guardar", así que no hace falta agregar nada más para poder borrar
// una unidad desde acá.
//
// feeAmount opcional: dejarlo vacío hace que la unidad vuelva a usar la
// cuota general de la colonia (defaultFeeAmount).
export function UnitEdit() {
  const { permissions } = usePermissions<Permissions>()
  const isSuperAdmin = isSuperAdministrador(permissions ?? null)
  return (
    <Edit redirect="list">
      <SimpleForm>
        <UnitEditTitle />

        <AppFormRow>
          <AppFormCol span={3}>
            <BooleanInput source="active" />
          </AppFormCol>
          {/* Un Administrador no puede mudar una unidad a otra colonia --
              api/Units.cs ignora este campo del body cuando quien edita
              está acotado a una colonia (scope.IsScoped). Mostrarle el
              selector igual solo lo confundiría. */}
          {isSuperAdmin ? (
            <AppFormCol span={3}>
              <ReferenceInput source="neighborhoodId" reference="neighborhoods">
                <AutocompleteInput optionText="name" validate={required()} fullWidth />
              </ReferenceInput>
            </AppFormCol>
          ) : null}
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={3}>
            <TextInput source="identifier" validate={required()} fullWidth />
          </AppFormCol>
          <AppFormCol span={3}>
            <TextInput source="address" validate={required()} fullWidth />
          </AppFormCol>
          <AppFormCol span={3}>
            <NumberInput
              source="feeAmount"
              fullWidth
              helperText="app.units.feeHelp"
            />
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Edit>
  )
}
