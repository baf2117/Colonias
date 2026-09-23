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
} from 'react-admin'
import { Stack } from '@mui/material'
import type { Permissions } from '../authProvider'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { isPureResident } from '../components/RequireRole'
import { formatMonthYear, useFormatLocale } from '../i18n/useFormatLocale'
import { PaymentAmountField } from './PaymentAmountField'
import { PaymentPeriodField } from './PaymentPeriodField'
import { PaymentReceiptField } from './PaymentReceiptField'
import { PaymentStatusField } from './PaymentStatusField'
import { ReplaceReceiptButton } from './ReplaceReceiptButton'

// Título con la unidad y el mes ("Casa 12 — Septiembre 2026"), igual de
// espíritu que UnitShow/ExpenseShow (usan el dato real en vez del nombre
// genérico del recurso).
function PaymentShowTitle() {
  const record = useRecordContext<{ unitId: number; period: string }>()
  const formatLocale = useFormatLocale()
  const { data: unit } = useGetOne(
    'units',
    { id: record?.unitId },
    { enabled: !!record?.unitId },
  )
  if (!record) return <AppPageTitle> </AppPageTitle>
  const period = formatMonthYear(new Date(record.period), formatLocale)
  return <AppPageTitle>{unit ? `${unit.identifier} — ${period}` : period}</AppPageTitle>
}

// Motivo de rechazo solo tiene algo que decir si el pago está
// rechazado -- para "pending"/"approved" siempre queda vacío (Payments.cs
// solo lo completa junto con Status="rejected"), así que mostrarlo ahí
// era un campo vacío permanente sin ninguna información.
function RejectionReasonField() {
  const record = useRecordContext<{ status: string }>()
  if (record?.status !== 'rejected') {
    return null
  }
  return (
    <AppFormCol span={3}>
      <Labeled source="rejectionReason" label="app.payments.rejectionReason">
        <TextField source="rejectionReason" emptyText="—" />
      </Labeled>
    </AppFormCol>
  )
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
// Un residente puro no ve la Unidad ni el Residente en el detalle de su
// pago -- ya se sabe que es su propia unidad y que el residente es él
// mismo, mostrarlo es información redundante (mismo criterio que la
// columna Unidad de PaymentList, ver RequireRole.tsx). Todos los campos
// de esta pantalla usan el mismo ancho (span={3}), a pedido del usuario
// -- ancho fijo y consistente en vez de estirar cada campo para llenar
// la fila entera, así que algunas filas quedan con espacio libre a la
// derecha (por ejemplo, la primera fila para un residente puro, que
// solo tiene Mes y Monto).
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
          {isResident ? null : (
            <AppFormCol span={3}>
              <Labeled source="residentId">
                <ReferenceField source="residentId" reference="residents" emptyText="—">
                  <TextField source="name" />
                </ReferenceField>
              </Labeled>
            </AppFormCol>
          )}
          <AppFormCol span={3}>
            <Labeled label="app.common.month">
              <PaymentPeriodField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
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
          <AppFormCol span={3}>
            <Labeled label="app.common.receipt">
              {/* Un residente puede cambiar su comprobante mientras el pago
                  esté pendiente o rechazado (ReplaceReceiptButton se oculta
                  solo si está aprobado). */}
              <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
                <PaymentReceiptField />
                {isResident ? <ReplaceReceiptButton /> : null}
              </Stack>
            </Labeled>
          </AppFormCol>
          {/* Día en que entró la plata; puede ser de otro mes que la cuota
              (ver PaymentDate en schema.sql). */}
          <AppFormCol span={3}>
            <Labeled source="paymentDate">
              <DateField source="paymentDate" />
            </Labeled>
          </AppFormCol>
          <RejectionReasonField />
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={3}>
            <Labeled source="reviewedByUserId" label="app.payments.reviewedBy">
              {isResident ? (
                // El directorio de residentes está bloqueado del todo para
                // un residente puro (GET /api/residents, ver "Permisos por
                // rol"), así que el ReferenceField de abajo nunca podía
                // resolver el nombre del administrador que revisó -- el
                // campo quedaba en blanco. Además, un residente no tiene
                // por qué poder entrar a la ficha del administrador (el
                // link que arma ReferenceField). Por eso para este rol se
                // usa el nombre ya resuelto del lado del servidor
                // (Payments.cs hace el JOIN a Residents y lo manda como
                // reviewedByName) como texto plano, sin ningún link.
                <TextField source="reviewedByName" emptyText="—" />
              ) : (
                <ReferenceField source="reviewedByUserId" reference="residents" emptyText="—">
                  <TextField source="name" />
                </ReferenceField>
              )}
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="reviewedAt" label="app.payments.reviewedAt">
              <DateField source="reviewedAt" showTime emptyText="—" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="createdAt" label="app.payments.createdAt">
              <DateField source="createdAt" showTime />
            </Labeled>
          </AppFormCol>
        </AppFormRow>
      </SimpleShowLayout>
    </Show>
  )
}
