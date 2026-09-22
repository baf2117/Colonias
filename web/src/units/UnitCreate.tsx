import {
  AutocompleteInput,
  BooleanInput,
  Create,
  NumberInput,
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
import { isSuperAdministrador } from '../components/RequireRole'

// Misma pantalla de referencia que NeighborhoodCreate: título centrado
// (AppPageTitle) + campos en la grilla de 12 columnas (AppFormRow +
// AppFormCol). Toda Unidad pertenece a una Colonia — dbo.Units.NeighborhoodId
// es NOT NULL con FK a dbo.Neighborhoods (migración 0002) — así que el
// selector de Colonia es obligatorio acá, igual que el nombre y la
// dirección.
//
// feeAmount es opcional (migración 0005): si se deja vacío, la unidad
// usa la cuota general de su colonia (defaultFeeAmount); solo hace
// falta llenarlo para darle una cuota propia, distinta a la del resto.
export function UnitCreate() {
  const translate = useTranslate()
  const { permissions } = usePermissions<Permissions>()
  const isSuperAdmin = isSuperAdministrador(permissions ?? null)
  return (
    <Create redirect="list">
      <SimpleForm>
        <AppPageTitle>{translate('resources.units.name', { smart_count: 1 })}</AppPageTitle>

        <AppFormRow>
          <AppFormCol span={3}>
            <BooleanInput source="active" defaultValue={true} />
          </AppFormCol>
          {/* Un Administrador no elige colonia -- api/Units.cs
              (ResolveNeighborhoodScope) crea la unidad directo en la
              suya, ignorando lo que mande acá. Mostrarle el selector
              igual solo lo confundiría. */}
          {isSuperAdmin ? (
            <AppFormCol span={4}>
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
          <AppFormCol span={4}>
            <TextInput source="address" validate={required()} fullWidth />
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={4}>
            <NumberInput
              source="feeAmount"
              fullWidth
              helperText="Vacío = usa la cuota de la colonia"
            />
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Create>
  )
}
