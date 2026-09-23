import {
  BooleanField,
  EditButton,
  Labeled,
  ReferenceField,
  Show,
  SimpleShowLayout,
  TextField,
  TopToolbar,
  usePermissions,
  useRecordContext,
  useTranslate,
} from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { canEditResident } from '../components/RequireRole'
import type { Permissions } from '../authProvider'

function ResidentShowTitle() {
  const record = useRecordContext()
  return <AppPageTitle>{record?.name ?? ''}</AppPageTitle>
}

// Sin EditButton para un Administrador mirando la ficha de otro
// Administrador/SuperAdministrador -- ver canEditResident.
type ResidentRecord = { id: number; administrador: boolean; superAdministrador: boolean }

const ResidentShowActions = () => {
  const record = useRecordContext<ResidentRecord>()
  const { permissions } = usePermissions<Permissions>()
  if (!record || !canEditResident(permissions ?? null, record)) {
    return null
  }
  return (
    <TopToolbar>
      <EditButton />
    </TopToolbar>
  )
}

// Auth0Sub nunca se muestra tal cual (es un identificador técnico, no
// algo legible) — solo si la cuenta ya está vinculada o no, que es lo
// único que le importa a quien administra la colonia. No todo residente
// inicia sesión en el sistema (ver la nota sobre Auth0Sub opcional en
// schema.sql y en el diagrama ER).
function ResidentAccountField() {
  const record = useRecordContext<{ auth0Sub: string | null }>()
  const translate = useTranslate()
  return <span>{record?.auth0Sub ? translate('app.common.accountLinked') : translate('app.common.accountNone')}</span>
}

// Misma pantalla de referencia que UnitShow (título + AppFormRow/
// AppFormCol de 12 columnas, solo lectura).
export function ResidentShow() {
  return (
    <Show actions={<ResidentShowActions />}>
      <SimpleShowLayout>
        <ResidentShowTitle />
        <AppFormRow>
          <AppFormCol span={3}>
            <Labeled label="app.common.account">
              <ResidentAccountField />
            </Labeled>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={3}>
            <Labeled source="phone">
              <TextField source="phone" emptyText="—" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="email">
              <TextField source="email" emptyText="—" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="active">
              <BooleanField source="active" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="unitId">
              <ReferenceField source="unitId" reference="units" emptyText="— (sin unidad)">
                <TextField source="identifier" />
              </ReferenceField>
            </Labeled>
          </AppFormCol>
        </AppFormRow>
        <AppFormRow>
          <AppFormCol span={3}>
            <Labeled label="app.residents.receiveEmails">
              <BooleanField source="receiveEmails" />
            </Labeled>
          </AppFormCol>
        </AppFormRow>
        <AppFormRow>
          <AppFormCol span={4}>
            <Labeled source="residente">
              <BooleanField source="residente" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={4}>
            <Labeled source="administrador">
              <BooleanField source="administrador" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={4}>
            <Labeled source="superAdministrador">
              <BooleanField source="superAdministrador" />
            </Labeled>
          </AppFormCol>
        </AppFormRow>
      </SimpleShowLayout>
    </Show>
  )
}
