import {
  DateField,
  EditButton,
  Labeled,
  ReferenceField,
  Show,
  SimpleShowLayout,
  TextField,
  TopToolbar,
  usePermissions,
  useGetOne,
  useRecordContext,
  useTranslate,
} from 'react-admin'
import type { Permissions } from '../authProvider'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { isPureResident } from '../components/RequireRole'
import { PaymentAmountField } from './PaymentAmountField'
import { PaymentPeriodField } from './PaymentPeriodField'
import { PaymentReceiptField } from './PaymentReceiptField'
import { PaymentStatusField } from './PaymentStatusField'

// Título con la unidad y el mes ("Casa 12 — Septiembre 2026"), igual de
// espíritu que UnitShow/ExpenseShow (usan el dato real en vez del nombre
// genérico del recurso).
function PaymentShowTitle() {
  const record = useRecordContext<{ unitId: number; period: string }>()
  const { data: unit } = useGetOne(
    'units',
    { id: record?.unitId },
    { enabled: !!record?.unitId },
  )
  if (!record) return <AppPageTitle> </AppPageTitle>
  const period = new Intl.DateTimeFormat('es-GT', { year: 'numeric', month: 'long' }).format(new Date(record.period))
  return <AppPageTitle>{unit ? `${unit.identifier} — ${period}` : period}</AppPageTitle>
}

// Un residente puro no puede modificar un pago ya cargado (ver
// api/Payments.cs, UpdatePayment: devuelve 403 si lo intenta) -- acá se
// le oculta directamente el botón "Editar" en vez de dejar que lo
// encuentre y se choque con ese 403.
const PaymentShowActions = () => {
  const { permissions } = usePermissions<Permissions>()
  if (isPureResident(permissions ?? null)) {
    return null
  }
  return (
    <TopToolbar>
      <EditButton />
    </TopToolbar>
  )
}

// Misma pantalla de referencia que ExpenseShow (título + AppFormRow/
// AppFormCol de 12 columnas, solo lectura). ReviewedByUserId/ReviewedAt
// solo se completan cuando el Status pasó de pending a approved/rejected
// (ver Payments.cs) — emptyText cubre el caso de un pago aún pendiente.
// Un residente puro no ve la Unidad en el detalle de su pago -- ya se
// sabe que es la suya, mostrarla es información redundante (mismo
// criterio que la columna Unidad de PaymentList, ver RequireRole.tsx).
export function PaymentShow() {
  const { permissions } = usePermissions<Permissions>()
  const isResident = isPureResident(permissions ?? null)
  return (
    <Show actions={<PaymentShowActions />}>
      <SimpleShowLayout>
        <PaymentShowTitle />

        <AppFormRow>
          {isResident ? null : (
            <AppFormCol span={3}>
              <Labeled source="unitId">
                <ReferenceField source="unitId" reference="units">
                  <TextField source="identifier" />
                </ReferenceField>
              </Labeled>
            </AppFormCol>
          )}
          <AppFormCol span={isResident ? 4 : 3}>
            <Labeled source="residentId">
              <ReferenceField source="residentId" reference="residents" emptyText="—">
                <TextField source="name" />
              </ReferenceField>
            </Labeled>
          </AppFormCol>
          <AppFormCol span={isResident ? 4 : 3}>
            <Labeled label="Mes">
              <PaymentPeriodField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={isResident ? 4 : 3}>
            <Labeled source="amount">
              <PaymentAmountField />
            </Labeled>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={3}>
            <Labeled source="status">
              <PaymentStatusField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={5}>
            <Labeled label="Comprobante">
              <PaymentReceiptField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={4}>
            <Labeled source="rejectionReason" label="Motivo de rechazo">
              <TextField source="rejectionReason" emptyText="—" />
            </Labeled>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={4}>
            <Labeled source="reviewedByUserId" label="Revisado por">
              <ReferenceField source="reviewedByUserId" reference="residents" emptyText="—">
                <TextField source="name" />
              </ReferenceField>
            </Labeled>
          </AppFormCol>
          <AppFormCol span={4}>
            <Labeled source="reviewedAt" label="Revisado el">
              <DateField source="reviewedAt" showTime emptyText="—" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={4}>
            <Labeled source="createdAt" label="Registrado el">
              <DateField source="createdAt" showTime />
            </Labeled>
          </AppFormCol>
        </AppFormRow>
      </SimpleShowLayout>
    </Show>
  )
}
