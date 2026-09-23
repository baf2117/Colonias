import {
  AutocompleteInput,
  Create,
  Labeled,
  ReferenceInput,
  required,
  SimpleForm,
  useTranslate,
} from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { MonthInput } from '../components/MonthInput'
import { currentMonthValue } from '../components/monthValue'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { PayrollEffectiveAmountPreview } from './PayrollEffectiveAmountPreview'

// Mismo estándar de título + grilla de 12 columnas que PaymentCreate.
// Period se manda con cualquier día del mes elegido: api/Payroll.cs lo
// normaliza al día 1 antes de guardarlo; MonthInput solo deja elegir
// "el mes", no un día puntual.
//
// El monto no es un campo del formulario: no se puede escribir a mano.
// Es Salary + Bonuses del guardia (ver "Guardias: identidad paralela en
// SecurityStaff"), y el servidor lo calcula al crear el pago
// (GetEffectivePayrollAmountAsync en Payroll.cs), sin leer nada del
// body. PayrollEffectiveAmountPreview solo muestra ese mismo cálculo en
// pantalla para que el administrador sepa cuánto va a quedar registrado
// antes de guardar. Paid no aparece acá: siempre arranca en false (ver
// Payroll.cs); se marca como pagado desde PayrollEdit.
export function PayrollCreate() {
  const translate = useTranslate()
  return (
    <Create redirect="show">
      <SimpleForm>
        <AppPageTitle>{translate('resources.payroll.name', { smart_count: 1 })}</AppPageTitle>

        <AppFormRow>
          <AppFormCol span={6}>
            <ReferenceInput source="staffId" reference="security-staff">
              <AutocompleteInput optionText="name" validate={required()} fullWidth />
            </ReferenceInput>
          </AppFormCol>
          <AppFormCol span={3}>
            <MonthInput source="period" label="app.common.month" validate={required()} defaultValue={currentMonthValue()} fullWidth />
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled label="app.common.amount">
              <PayrollEffectiveAmountPreview />
            </Labeled>
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Create>
  )
}
