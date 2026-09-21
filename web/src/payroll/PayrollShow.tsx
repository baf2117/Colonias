import {
  BooleanField,
  EditButton,
  Labeled,
  ReferenceField,
  Show,
  SimpleShowLayout,
  TextField,
  TopToolbar,
  useGetOne,
  useRecordContext,
} from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { PayrollAmountField } from './PayrollAmountField'
import { PayrollPeriodField } from './PayrollPeriodField'

// Título con el guardia y el mes ("Juan Pérez — Septiembre 2026"),
// mismo espíritu que PaymentShowTitle.
function PayrollShowTitle() {
  const record = useRecordContext<{ staffId: number; period: string }>()
  const { data: staff } = useGetOne(
    'security-staff',
    { id: record?.staffId },
    { enabled: !!record?.staffId },
  )
  if (!record) return <AppPageTitle> </AppPageTitle>
  const period = new Intl.DateTimeFormat('es-GT', { year: 'numeric', month: 'long' }).format(new Date(record.period))
  return <AppPageTitle>{staff ? `${staff.name} — ${period}` : period}</AppPageTitle>
}

const PayrollShowActions = () => (
  <TopToolbar>
    <EditButton />
  </TopToolbar>
)

// Misma pantalla de referencia que PaymentShow (título + AppFormRow/
// AppFormCol de 12 columnas, solo lectura).
export function PayrollShow() {
  return (
    <Show actions={<PayrollShowActions />}>
      <SimpleShowLayout>
        <PayrollShowTitle />

        <AppFormRow>
          <AppFormCol span={4}>
            <Labeled source="staffId">
              <ReferenceField source="staffId" reference="security-staff">
                <TextField source="name" />
              </ReferenceField>
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled label="Mes">
              <PayrollPeriodField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="amount">
              <PayrollAmountField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={2}>
            <Labeled source="paid">
              <BooleanField source="paid" />
            </Labeled>
          </AppFormCol>
        </AppFormRow>
      </SimpleShowLayout>
    </Show>
  )
}
