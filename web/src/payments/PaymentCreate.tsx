import {
  AutocompleteInput,
  Create,
  DateInput,
  Labeled,
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
import { PaymentEffectiveAmountPreview } from './PaymentEffectiveAmountPreview'

const STATUS_CHOICES = [
  { id: 'pending', name: 'Pendiente' },
  { id: 'approved', name: 'Aprobado' },
  { id: 'rejected', name: 'Rechazado' },
]

// Mismo estándar de título + grilla de 12 columnas que ExpenseCreate.
// Period se manda con cualquier día del mes elegido: api/Payments.cs lo
// normaliza al día 1 antes de guardarlo, así que el DateInput sirve para
// elegir "el mes", no un día puntual.
//
// La regla central que pidió el usuario (no permitir un segundo pago
// pendiente/aprobado para la misma unidad y mes) la aplica el servidor,
// no este formulario: si ya hay uno, el POST devuelve 409 y react-admin
// muestra el mensaje de error en la notificación en vez de guardar.
//
// El monto no es un campo del formulario: no se puede escribir a mano.
// Es la cuota efectiva de la unidad (la propia si tiene una, si no la de
// su colonia — ver "Cuota de la colonia y de la unidad"), y el servidor
// la calcula al crear el pago (GetEffectiveFeeAsync en Payments.cs), sin
// leer nada del body. PaymentEffectiveAmountPreview solo muestra ese
// mismo cálculo en pantalla para que el administrador sepa cuánto va a
// quedar registrado antes de guardar.
//
// ReviewedByUserId/ReviewedAt no aparecen acá: el servidor los resuelve
// solo cuando Status no queda en "pending" (ver Payments.cs).
export function PaymentCreate() {
  const translate = useTranslate()
  return (
    <Create redirect="list">
      <SimpleForm>
        <AppPageTitle>{translate('resources.payments.name', { smart_count: 1 })}</AppPageTitle>

        <AppFormRow>
          <AppFormCol span={4}>
            <ReferenceInput source="unitId" reference="units">
              <AutocompleteInput optionText="identifier" validate={required()} fullWidth />
            </ReferenceInput>
          </AppFormCol>
          <AppFormCol span={4}>
            <ReferenceInput source="residentId" reference="residents">
              <AutocompleteInput optionText="name" fullWidth />
            </ReferenceInput>
          </AppFormCol>
          <AppFormCol span={4}>
            <DateInput source="period" label="Mes" validate={required()} defaultValue={new Date().toISOString().slice(0, 10)} fullWidth />
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={4}>
            <Labeled label="Monto">
              <PaymentEffectiveAmountPreview />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={4}>
            <SelectInput source="status" choices={STATUS_CHOICES} defaultValue="pending" fullWidth />
          </AppFormCol>
          <AppFormCol span={4}>
            <TextInput source="receiptBlobPath" label="Comprobante" fullWidth />
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={12}>
            <TextInput source="rejectionReason" label="Motivo de rechazo" multiline fullWidth />
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Create>
  )
}
