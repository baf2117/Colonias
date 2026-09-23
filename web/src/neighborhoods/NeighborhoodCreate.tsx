import { AutocompleteInput, BooleanInput, Create, NumberInput, required, SimpleForm, TextInput, useLocaleState, useTranslate } from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { getCurrencyChoices } from '../lib/currencies'

// Pantalla de referencia del proyecto: título centrado (AppPageTitle) +
// campos distribuidos en una grilla de 12 columnas (AppFormRow +
// AppFormCol span={n}), en vez de un maxWidth en píxeles por campo.
// Cualquier pantalla nueva de cualquier recurso repite este mismo par de
// piezas en vez de resolver el título o el layout a mano de nuevo.
//
// defaultFeeAmount es la cuota general de la colonia (migración 0005):
// toda Unidad que no tenga su propia cuota (Units.FeeAmount) usa este
// valor, así que cambiarlo más adelante (desde NeighborhoodEdit) afecta
// a todas esas unidades de una sola vez.
//
// currency (migración 0007) es la moneda de toda la colonia — un
// código ISO 4217 (GTQ, USD, etc.), no un monto — así que todos los
// montos de sus unidades y pagos quedan expresados en esa misma
// moneda. Las opciones salen de getCurrencyChoices(), que usa
// Intl.supportedValuesOf('currency') (nativo del navegador, sin
// paquete externo) para listar todas las monedas que existen.
//
// smart_count: 1 saca la forma singular ("Colonia") del mismo nombre de
// recurso que ya usan las traducciones (i18n/es.ts).
export function NeighborhoodCreate() {
  const translate = useTranslate()
  const [locale] = useLocaleState()
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
          <AppFormCol span={3}>
            <NumberInput source="defaultFeeAmount" validate={required()} defaultValue={0} fullWidth />
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={4}>
            <AutocompleteInput
              source="currency"
              choices={getCurrencyChoices(locale)}
              validate={required()}
              defaultValue="GTQ"
              fullWidth
            />
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Create>
  )
}
