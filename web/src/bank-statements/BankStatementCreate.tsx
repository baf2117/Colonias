import {
  AutocompleteInput,
  Create,
  Labeled,
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
import { MonthInput } from '../components/MonthInput'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { isSuperAdministrador } from '../components/RequireRole'
import { BankStatementFileUploadInput } from './BankStatementFileUploadInput'

// El estado de cuenta suele llegar ya cerrado el mes, así que el mes por
// defecto es el anterior. api/BankStatements.cs lo normaliza al día 1.
function firstDayOfPreviousMonth(): string {
  const now = new Date()
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}-01`
}

// La colonia solo la elige un SuperAdministrador; a un Administrador el
// API le fuerza la suya (ResolveTargetNeighborhood en BankStatements.cs).
export function BankStatementCreate() {
  const translate = useTranslate()
  const { permissions } = usePermissions<Permissions>()
  const isSuperAdmin = isSuperAdministrador(permissions ?? null)
  return (
    <Create redirect="show">
      <SimpleForm>
        <AppPageTitle>{translate('resources.bank-statements.name', { smart_count: 1 })}</AppPageTitle>

        <AppFormRow>
          {isSuperAdmin ? (
            <AppFormCol span={4}>
              <ReferenceInput source="neighborhoodId" reference="neighborhoods" perPage={100} sort={{ field: 'name', order: 'ASC' }}>
                <AutocompleteInput optionText="name" validate={required()} fullWidth />
              </ReferenceInput>
            </AppFormCol>
          ) : null}
          <AppFormCol span={isSuperAdmin ? 4 : 6}>
            <MonthInput source="period" label="app.common.month" validate={required()} defaultValue={firstDayOfPreviousMonth()} fullWidth />
          </AppFormCol>
          <AppFormCol span={isSuperAdmin ? 4 : 6}>
            <NumberInput source="bankBalance" validate={required()} fullWidth helperText="app.bankStatements.bankBalanceHelp" />
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={8}>
            <TextInput source="notes" multiline fullWidth />
          </AppFormCol>
          <AppFormCol span={4}>
            <Labeled label="app.common.file">
              <BankStatementFileUploadInput source="statementBlobPath" validate={required('app.bankStatements.fileRequired')} />
            </Labeled>
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Create>
  )
}
