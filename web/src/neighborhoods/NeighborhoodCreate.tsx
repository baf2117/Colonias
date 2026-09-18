import { BooleanInput, Create, required, SimpleForm, TextInput, useTranslate } from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'

// Pantalla de referencia del proyecto: título centrado (AppPageTitle) +
// campos distribuidos en una grilla de 12 columnas (AppFormRow +
// AppFormCol span={n}), en vez de un maxWidth en píxeles por campo.
// Cualquier pantalla nueva de cualquier recurso repite este mismo par de
// piezas en vez de resolver el título o el layout a mano de nuevo.
//
// smart_count: 1 saca la forma singular ("Colonia") del mismo nombre de
// recurso que ya usan las traducciones (i18n/es.ts).
export function NeighborhoodCreate() {
  const translate = useTranslate()
  return (
    <Create redirect="list">
      <SimpleForm>
        <AppPageTitle>{translate('resources.neighborhoods.name', { smart_count: 1 })}</AppPageTitle>

        <AppFormRow>
          <AppFormCol span={3}>
            <BooleanInput source="active" defaultValue={true} />
          </AppFormCol>
          <AppFormCol span={3}>
            <BooleanInput source="temporaryCodesEnabled" defaultValue={true} />
          </AppFormCol>
          <AppFormCol span={3}>
            <BooleanInput source="permanentCodesEnabled" defaultValue={true} />
          </AppFormCol>
          <AppFormCol span={3}>
            <BooleanInput source="denyAccessEnabled" defaultValue={false} />
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={6}>
            <TextInput source="name" validate={required()} fullWidth />
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Create>
  )
}
