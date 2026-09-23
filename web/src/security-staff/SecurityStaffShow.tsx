import { Box, Typography } from '@mui/material'
import {
  BooleanField,
  CreateButton,
  DateField,
  EditButton,
  Labeled,
  ReferenceField,
  ReferenceManyField,
  Show,
  SimpleShowLayout,
  TextField,
  TopToolbar,
  useGetOne,
  useRecordContext,
  useTranslate,
} from 'react-admin'
import { AppDatagrid } from '../components/AppDatagrid'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { useFormatLocale } from '../i18n/useFormatLocale'
import { PayrollAmountField } from '../payroll/PayrollAmountField'
import { PayrollPeriodField } from '../payroll/PayrollPeriodField'

function SecurityStaffShowTitle() {
  const record = useRecordContext()
  return <AppPageTitle>{record?.name ?? ''}</AppPageTitle>
}

const SecurityStaffShowActions = () => (
  <TopToolbar>
    <EditButton />
  </TopToolbar>
)

// Mismo criterio que ResidentAccountField: Auth0Sub nunca se muestra
// tal cual, solo si la cuenta ya está vinculada o no.
function SecurityStaffAccountField() {
  const record = useRecordContext<{ auth0Sub: string | null }>()
  const translate = useTranslate()
  return <span>{record?.auth0Sub ? translate('app.common.accountLinked') : translate('app.common.accountNone')}</span>
}

// Salary/Bonuses son montos sueltos (igual que Units.FeeAmount): el
// guardia solo sabe a qué colonia pertenece, y la moneda vive en
// Neighborhoods.Currency — mismo criterio que UnitFeeAmountField en
// UnitShow.tsx, pero acá el salto es directo (SecurityStaff.NeighborhoodId)
// en vez de necesitar pasar primero por una unidad.
function SecurityStaffSalaryField() {
  const record = useRecordContext<{ salary: number; neighborhoodId: number }>()
  const formatLocale = useFormatLocale()
  const { data: neighborhood } = useGetOne(
    'neighborhoods',
    { id: record?.neighborhoodId },
    { enabled: !!record?.neighborhoodId },
  )
  if (!record || !neighborhood) return null
  return <span>{new Intl.NumberFormat(formatLocale, { style: 'currency', currency: neighborhood.currency }).format(record.salary)}</span>
}

function SecurityStaffBonusesField() {
  const record = useRecordContext<{ bonuses: number; neighborhoodId: number }>()
  const formatLocale = useFormatLocale()
  const { data: neighborhood } = useGetOne(
    'neighborhoods',
    { id: record?.neighborhoodId },
    { enabled: !!record?.neighborhoodId },
  )
  if (!record || !neighborhood) return null
  return <span>{new Intl.NumberFormat(formatLocale, { style: 'currency', currency: neighborhood.currency }).format(record.bonuses)}</span>
}

// Nómina de este guardia (Payroll.StaffId → SecurityStaff.StaffId), mismo
// patrón que UnitResidentsSection/NeighborhoodStaffSection. El botón
// "Nuevo pago" precarga staffId en PayrollCreate; el Amount de cada fila
// nunca se elige a mano (ver api/Payroll.cs), por eso no hay preview acá.
function SecurityStaffPayrollSection() {
  const record = useRecordContext()
  const translate = useTranslate()
  if (!record) return null
  return (
    <Box sx={{ width: '100%', mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">{translate('app.guards.payroll')}</Typography>
        <CreateButton resource="payroll" label="app.guards.newPayment" state={{ record: { staffId: record.id } }} />
      </Box>
      <ReferenceManyField reference="payroll" target="staffId" label={false} sort={{ field: 'period', order: 'DESC' }}>
        <AppDatagrid rowClick="show" bulkActionButtons={false}>
          <PayrollPeriodField label="app.common.month" />
          <PayrollAmountField label="app.common.amount" />
          <BooleanField source="paid" label="resources.payroll.fields.paid" />
        </AppDatagrid>
      </ReferenceManyField>
    </Box>
  )
}

export function SecurityStaffShow() {
  return (
    <Show actions={<SecurityStaffShowActions />}>
      <SimpleShowLayout>
        <SecurityStaffShowTitle />

        <AppFormRow>
          <AppFormCol span={3}>
            <Labeled label="app.common.account">
              <SecurityStaffAccountField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="active">
              <BooleanField source="active" />
            </Labeled>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={3}>
            <Labeled source="phone">
              <TextField source="phone" emptyText="—" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={5}>
            <Labeled source="neighborhoodId">
              <ReferenceField source="neighborhoodId" reference="neighborhoods">
                <TextField source="name" />
              </ReferenceField>
            </Labeled>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={3}>
            <Labeled source="salary">
              <SecurityStaffSalaryField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="bonuses">
              <SecurityStaffBonusesField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="hireDate">
              <DateField source="hireDate" emptyText="—" />
            </Labeled>
          </AppFormCol>
        </AppFormRow>

        <SecurityStaffPayrollSection />
      </SimpleShowLayout>
    </Show>
  )
}
