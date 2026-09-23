import {
  AutocompleteInput,
  BooleanInput,
  Create,
  DateInput,
  NumberInput,
  ReferenceInput,
  required,
  SimpleForm,
  TextInput,
  useTranslate,
} from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { notFutureDate } from '../components/notFutureDate'

// Un guardia pertenece directo a una colonia (NeighborhoodId NOT NULL),
// nunca a una unidad — a diferencia de Residents.UnitId, acá no hay
// selector de unidad. Auth0Sub no aparece en este formulario: solo se
// setea a través del auto-registro (RegisterSecurityStaff en
// api/SecurityStaff.cs), nunca a mano desde el dashboard.
export function SecurityStaffCreate() {
  const translate = useTranslate()
  return (
    <Create redirect="list">
      <SimpleForm>
        <AppPageTitle>{translate('resources.security-staff.name', { smart_count: 1 })}</AppPageTitle>

        <AppFormRow>
          <AppFormCol span={4}>
            <TextInput source="name" validate={required()} fullWidth />
          </AppFormCol>
          <AppFormCol span={4}>
            <TextInput source="phone" fullWidth />
          </AppFormCol>
          <AppFormCol span={2}>
            <BooleanInput source="active" defaultValue={true} />
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={6}>
            <ReferenceInput source="neighborhoodId" reference="neighborhoods">
              <AutocompleteInput optionText="name" validate={required()} fullWidth />
            </ReferenceInput>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={3}>
            <NumberInput source="salary" defaultValue={0} fullWidth />
          </AppFormCol>
          <AppFormCol span={3}>
            <NumberInput source="bonuses" defaultValue={0} fullWidth />
          </AppFormCol>
          {/* Prorratea el Bono 14 y el aguinaldo en el estado de cuentas
              (api/AccountStatement.cs, AccruedFor). */}
          <AppFormCol span={3}>
            <DateInput
              source="hireDate"
              validate={[required(), notFutureDate('app.guards.futureHireDate')]}
              helperText="app.guards.hireDateHelp"
              fullWidth
            />
          </AppFormCol>
        </AppFormRow>
      </SimpleForm>
    </Create>
  )
}
