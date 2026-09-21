import {
  AutocompleteInput,
  DateInput,
  Edit,
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
import { PaymentAmountField } from './PaymentAmountField'

const STATUS_CHOICES = [
  { id: 'pending', name: 'Pendiente' },
  { id: 'approved', name: 'Aprobado' },
  { id: 'rejected', name: 'Rechazado' },
]

// Mismo formulario que PaymentCreate, precargado con los valores
// actuales. Cambiar Status acá (por ejemplo, de "pending" a "approved" o
// "rejected") es cómo el administrador aprueba o rechaza un pago — el
// servidor asienta quién y cuándo lo revisó solo cuando ese cambio
// realmente ocurre en esta llamada (ver isNewReview en Payments.cs), no
// en cada edición. La misma regla de duplicado que en Create se vuelve a
// chequear acá (excluyendo el propio pago que se está editando).
//
// El monto no se puede editar: Payments.cs ni siquiera lo acepta en el
// body de este endpoint (quedó fijo desde que se creó el pago, como la
// cuota efectiva de la unidad en ese momento — ver PaymentCreate.tsx),
// así que acá se muestra de solo lectura con PaymentAmountField, igual
// que en PaymentShow.
export function PaymentEdit() {
  const translate = useTranslate()
  return (
    <Edit redirect="list">
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
            <DateInput source="period" label="Mes" validate={required()} fullWidth />
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={4}>
            <Labeled source="amount">
              <PaymentAmountField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={4}>
            <SelectInput source="status" choices={STATUS_CHOICES} fullWidth />
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
    </Edit>
  )
}
