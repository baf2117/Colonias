import { DateField, EditButton, Labeled, Show, SimpleShowLayout, TextField, TopToolbar, useTranslate } from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { PaymentPeriodField } from '../payments/PaymentPeriodField'
import { BankStatementFileField } from './BankStatementFileField'
import { BankStatementBalanceField, BankStatementNeighborhoodField } from './BankStatementFields'

const BankStatementShowActions = () => (
  <TopToolbar>
    <EditButton />
  </TopToolbar>
)

export function BankStatementShow() {
  const translate = useTranslate()
  return (
    <Show actions={<BankStatementShowActions />}>
      <SimpleShowLayout>
        <AppPageTitle>{translate('resources.bank-statements.name', { smart_count: 1 })}</AppPageTitle>

        <AppFormRow>
          <AppFormCol span={4}>
            <Labeled label="Colonia">
              <BankStatementNeighborhoodField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={4}>
            <Labeled label="Mes">
              <PaymentPeriodField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={4}>
            <Labeled source="bankBalance">
              <BankStatementBalanceField />
            </Labeled>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={4}>
            <Labeled label="Archivo">
              <BankStatementFileField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={4}>
            <Labeled source="notes">
              <TextField source="notes" emptyText="—" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={4}>
            <Labeled source="createdAt">
              <DateField source="createdAt" showTime />
            </Labeled>
          </AppFormCol>
        </AppFormRow>
      </SimpleShowLayout>
    </Show>
  )
}
