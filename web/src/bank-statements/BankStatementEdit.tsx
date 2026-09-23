import { Edit, Labeled, NumberInput, required, SimpleForm, TextInput, useTranslate } from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { MonthInput } from '../components/MonthInput'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { SuperAdminOnlyDeleteToolbar } from '../components/SuperAdminOnlyDeleteToolbar'
import { BankStatementFileUploadInput } from './BankStatementFileUploadInput'
import { BankStatementNeighborhoodField } from './BankStatementFields'

// La colonia no se cambia al editar (el archivo vive en la carpeta de esa
// colonia): se muestra de solo lectura. Eliminar es solo de
// SuperAdministrador, igual que pagos, gastos y nómina.
export function BankStatementEdit() {
  const translate = useTranslate()
  return (
    <Edit redirect="show">
      <SimpleForm toolbar={<SuperAdminOnlyDeleteToolbar />}>
        <AppPageTitle>{translate('resources.bank-statements.name', { smart_count: 1 })}</AppPageTitle>

        <AppFormRow>
          <AppFormCol span={4}>
            <Labeled label="app.common.neighborhood">
              <BankStatementNeighborhoodField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={4}>
            <MonthInput source="period" label="app.common.month" validate={required()} fullWidth />
          </AppFormCol>
          <AppFormCol span={4}>
            <NumberInput source="bankBalance" validate={required()} fullWidth />
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={8}>
            <TextInput source="notes" multiline fullWidth />
          </AppFormCol>
          <AppFormCol span={4}>
            <Labeled label="app.common.file">
              <BankStatementFileUploadInput source="statementBlobPath" validate={required()} />
            </Labeled>
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Edit>
  )
}
