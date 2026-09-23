import { AutocompleteInput, BooleanInput, Edit, NumberInput, required, SimpleForm, TextInput, useLocaleState, useRecordContext } from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { getCurrencyChoices } from '../lib/currencies'

// Primera pantalla de Edit de Colonia (antes solo existían lista, crear
// y ver). Hacía falta para que la cuota general pueda cambiar después
// de creada la colonia — si no, "cambiar la cuota de la colonia" no
// tendría ninguna pantalla desde la que hacerlo. Mismo formulario que
// NeighborhoodCreate, precargado con los valores actuales; el toolbar
// por defecto de SimpleForm en un <Edit> ya trae "Eliminar".
//
// currency también se puede cambiar acá — cambiar la moneda de una
// colonia con montos ya cargados no los convierte, solo cambia cómo se
// muestran de ahí en más (ver nota en NeighborhoodShow).
function NeighborhoodEditTitle() {
  const record = useRecordContext()
  return <AppPageTitle>{record?.name ?? ''}</AppPageTitle>
}

export function NeighborhoodEdit() {
  const [locale] = useLocaleState()
  return (
    <Edit redirect="list">
      <SimpleForm>
        <NeighborhoodEditTitle />

        <AppFormRow>
          <AppFormCol span={3}>
            <BooleanInput source="active" />
          </AppFormCol>
          <AppFormCol span={3}>
            <BooleanInput source="temporaryCodesEnabled" />
          </AppFormCol>
          <AppFormCol span={3}>
            <BooleanInput source="permanentCodesEnabled" />
          </AppFormCol>
          <AppFormCol span={3}>
            <BooleanInput source="denyAccessEnabled" />
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={6}>
            <TextInput source="name" validate={required()} fullWidth />
          </AppFormCol>
          <AppFormCol span={3}>
            <NumberInput source="defaultFeeAmount" validate={required()} fullWidth />
          </AppFormCol>
          <AppFormCol span={3}>
            <AutocompleteInput source="currency" choices={getCurrencyChoices(locale)} validate={required()} fullWidth />
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Edit>
  )
}
