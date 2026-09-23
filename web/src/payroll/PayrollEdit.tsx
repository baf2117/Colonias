import {
  AutocompleteInput,
  BooleanInput,
  Edit,
  Labeled,
  ReferenceInput,
  required,
  SimpleForm,
  useTranslate,
} from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { MonthInput } from '../components/MonthInput'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { SuperAdminOnlyDeleteToolbar } from '../components/SuperAdminOnlyDeleteToolbar'
import { PayrollAmountField } from './PayrollAmountField'

// Mismo formulario que PayrollCreate, precargado con los valores
// actuales, más "Pagado" (Paid) — que es lo que normalmente se viene a
// cambiar acá una vez que se hizo el pago real. El monto no se puede
// editar: Payroll.cs ni siquiera lo acepta en el body de este endpoint
// (quedó fijo desde que se creó el registro), así que acá se muestra de
// solo lectura con PayrollAmountField, igual que en PayrollShow.
export function PayrollEdit() {
  const translate = useTranslate()
  return (
    <Edit redirect="show">
      <SimpleForm toolbar={<SuperAdminOnlyDeleteToolbar />}>
        <AppPageTitle>{translate('resources.payroll.name', { smart_count: 1 })}</AppPageTitle>

        <AppFormRow>
          <AppFormCol span={6}>
            <ReferenceInput source="staffId" reference="security-staff">
              <AutocompleteInput optionText="name" validate={required()} fullWidth />
            </ReferenceInput>
          </AppFormCol>
          <AppFormCol span={3}>
            <MonthInput source="period" label="app.common.month" validate={required()} fullWidth />
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled label="app.common.amount">
              <PayrollAmountField />
            </Labeled>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={3}>
            <BooleanInput source="paid" />
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Edit>
  )
}
