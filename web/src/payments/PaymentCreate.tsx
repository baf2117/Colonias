import { useEffect } from 'react'
import {
  AutocompleteInput,
  Create,
  DateInput,
  Labeled,
  ReferenceInput,
  required,
  SelectInput,
  SimpleForm,
  usePermissions,
  useTranslate,
} from 'react-admin'
import { useFormContext, useWatch } from 'react-hook-form'
import type { Permissions } from '../authProvider'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { isPureResident } from '../components/RequireRole'
import { PaymentEffectiveAmountPreview } from './PaymentEffectiveAmountPreview'
import { ReceiptUploadInput } from './ReceiptUploadInput'

// Filtra el selector de Residente por la unidad ya elegida (api/Residents.cs
// ya soporta filter.unitId, el mismo que usa UnitShow para listar los
// residentes de una unidad) -- sin esto, el autocompletar mostraba TODOS
// los residentes de todas las colonias, cuando un pago siempre es de una
// unidad puntual. Si se cambia la unidad después de haber elegido un
// residente, se limpia la selección (podría quedar un residente de otra
// unidad, ya no visible en la lista filtrada, pero todavía seleccionado).
function ResidentInput() {
  const unitId = useWatch({ name: 'unitId' })
  const { setValue } = useFormContext()

  useEffect(() => {
    setValue('residentId', undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId])

  return (
    <ReferenceInput source="residentId" reference="residents" filter={unitId ? { unitId } : undefined}>
      <AutocompleteInput optionText="name" fullWidth />
    </ReferenceInput>
  )
}

const STATUS_CHOICES = [
  { id: 'pending', name: 'Pendiente' },
  { id: 'approved', name: 'Aprobado' },
  { id: 'rejected', name: 'Rechazado' },
]

// Mismo estándar de título + grilla de 12 columnas que ExpenseCreate.
// Period se manda con cualquier día del mes elegido: api/Payments.cs lo
// normaliza al día 1 antes de guardarlo, así que el DateInput sirve para
// elegir "el mes", no un día puntual.
//
// La regla central que pidió el usuario (no permitir un segundo pago
// pendiente/aprobado para la misma unidad y mes) la aplica el servidor,
// no este formulario: si ya hay uno, el POST devuelve 409 y react-admin
// muestra el mensaje de error en la notificación en vez de guardar.
//
// El monto no es un campo del formulario: no se puede escribir a mano.
// Es la cuota efectiva de la unidad (la propia si tiene una, si no la de
// su colonia — ver "Cuota de la colonia y de la unidad"), y el servidor
// la calcula al crear el pago (GetEffectiveFeeAsync en Payments.cs), sin
// leer nada del body. PaymentEffectiveAmountPreview solo muestra ese
// mismo cálculo en pantalla para que el administrador sepa cuánto va a
// quedar registrado antes de guardar.
//
// ReviewedByUserId/ReviewedAt no aparecen acá: el servidor los resuelve
// solo cuando Status no queda en "pending" (ver Payments.cs). Motivo de
// rechazo tampoco aparece acá para ningún rol -- no tiene sentido
// completarlo al cargar un pago recién creado; se completa después, al
// revisarlo, desde PaymentEdit.tsx (que sí conserva ese campo).
//
// Comprobante ya no es un campo de texto libre: ReceiptUploadInput sube
// el archivo directo a Blob Storage con una URL firmada (SAS) que pide
// api/Payments.cs (GetPaymentReceiptUploadUrl) ANTES de este submit --
// el pago recién se crea acá, con `receiptBlobPath` ya apuntando al
// archivo subido. Ver ReceiptUploadInput.tsx para el detalle.
//
// Un residente puro (Residente=true, sin Administrador ni
// SuperAdministrador) no ve Unidad ni Residente -- ya se sabe que es él y
// su propia unidad, api/Payments.cs los fuerza del lado del servidor y
// ni siquiera mira lo que mande el formulario para esos dos campos -- ni
// Estado, porque un pago cargado por un residente siempre nace "pending"
// (el servidor lo fuerza igual). Es el mismo criterio de "seguridad a
// nivel de fila resuelta en el código" que ya usan PaymentList/GetList:
// acá además el propio backend ignora esos tres campos si de todos
// modos llegaran en el body.
export function PaymentCreate() {
  const translate = useTranslate()
  const { permissions } = usePermissions<Permissions>()
  const isResident = isPureResident(permissions ?? null)
  return (
    <Create redirect="list">
      <SimpleForm>
        <AppPageTitle>{translate('resources.payments.name', { smart_count: 1 })}</AppPageTitle>

        {isResident ? (
          // Solo tres campos, una sola fila de tres columnas iguales
          // (span 4 c/u) — Mes ya no necesita ocupar la fila completa
          // ahora que no comparte con Unidad/Residente.
          <AppFormRow>
            <AppFormCol span={4}>
              <DateInput source="period" label="Mes" validate={required()} defaultValue={new Date().toISOString().slice(0, 10)} fullWidth />
            </AppFormCol>
            <AppFormCol span={4}>
              <Labeled label="Monto">
                <PaymentEffectiveAmountPreview />
              </Labeled>
            </AppFormCol>
            <AppFormCol span={4}>
              <Labeled label="Comprobante">
                <ReceiptUploadInput source="receiptBlobPath" />
              </Labeled>
            </AppFormCol>
          </AppFormRow>
        ) : (
          <>
            <AppFormRow>
              <AppFormCol span={4}>
                <ReferenceInput source="unitId" reference="units" sort={{ field: 'identifier', order: 'ASC' }}>
                  <AutocompleteInput optionText="identifier" validate={required()} fullWidth />
                </ReferenceInput>
              </AppFormCol>
              <AppFormCol span={4}>
                <ResidentInput />
              </AppFormCol>
              <AppFormCol span={4}>
                <DateInput source="period" label="Mes" validate={required()} defaultValue={new Date().toISOString().slice(0, 10)} fullWidth />
              </AppFormCol>
            </AppFormRow>

            <AppFormRow>
              <AppFormCol span={4}>
                <Labeled label="Monto">
                  <PaymentEffectiveAmountPreview />
                </Labeled>
              </AppFormCol>
              <AppFormCol span={4}>
                <SelectInput source="status" choices={STATUS_CHOICES} defaultValue="pending" fullWidth />
              </AppFormCol>
              <AppFormCol span={4}>
                <Labeled label="Comprobante">
                  <ReceiptUploadInput source="receiptBlobPath" />
                </Labeled>
              </AppFormCol>
            </AppFormRow>
          </>
        )}
      </SimpleForm>
    </Create>
  )
}
