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
import { MonthInput } from '../components/MonthInput'
import { notFutureDate } from '../components/notFutureDate'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { Stack } from '@mui/material'
import { SuperAdminOnlyDeleteToolbar } from '../components/SuperAdminOnlyDeleteToolbar'
import { PaymentAmountField } from './PaymentAmountField'
import { PaymentReceiptField } from './PaymentReceiptField'
import { ReceiptUploadInput } from './ReceiptUploadInput'

// SelectInput traduce el `name` de cada opción: van claves de app.paymentStatus.
const STATUS_CHOICES = [
  { id: 'pending', name: 'app.paymentStatus.pending' },
  { id: 'approved', name: 'app.paymentStatus.approved' },
  { id: 'rejected', name: 'app.paymentStatus.rejected' },
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
      <SimpleForm toolbar={<SuperAdminOnlyDeleteToolbar />}>
        <AppPageTitle>{translate('resources.payments.name', { smart_count: 1 })}</AppPageTitle>

        <AppFormRow>
          <AppFormCol span={4}>
            <ReferenceInput source="unitId" reference="units" sort={{ field: 'identifier', order: 'ASC' }}>
              <AutocompleteInput optionText="identifier" validate={required()} fullWidth />
            </ReferenceInput>
          </AppFormCol>
          <AppFormCol span={4}>
            <ReferenceInput source="residentId" reference="residents">
              <AutocompleteInput optionText="name" fullWidth />
            </ReferenceInput>
          </AppFormCol>
          <AppFormCol span={4}>
            <MonthInput source="period" label="app.common.month" validate={required()} fullWidth />
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={3}>
            <Labeled source="amount">
              <PaymentAmountField />
            </Labeled>
          </AppFormCol>
          {/* Al revisar un pago que subió un residente, acá se corrige la
              fecha de pago si la plata entró otro día que el de la carga. */}
          <AppFormCol span={3}>
            <DateInput
              source="paymentDate"
              validate={[required(), notFutureDate('app.payments.futurePaymentDate')]}
              fullWidth
            />
          </AppFormCol>
          <AppFormCol span={3}>
            <SelectInput source="status" choices={STATUS_CHOICES} fullWidth />
          </AppFormCol>
          <AppFormCol span={3}>
            {/* El comprobante guardado se abre con "Ver comprobante" (URL
                firmada, igual que en PaymentShow); para cambiarlo se sube
                otro archivo. Antes era un TextInput con la ruta interna
                del blob, que no servía para verlo. */}
            <Labeled label="app.common.receipt">
              <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
                <PaymentReceiptField />
                <ReceiptUploadInput source="receiptBlobPath" />
              </Stack>
            </Labeled>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={12}>
            <TextInput source="rejectionReason" label="app.payments.rejectionReason" multiline fullWidth />
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Edit>
  )
}
