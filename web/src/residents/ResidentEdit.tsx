import type { ReactNode } from 'react'
import {
  AutocompleteInput,
  BooleanInput,
  Edit,
  ReferenceInput,
  required,
  SimpleForm,
  TextInput,
  usePermissions,
  useRecordContext,
} from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { AccessDenied, canEditResident, canGrantSuperAdministrador } from '../components/RequireRole'
import type { Permissions } from '../authProvider'

// Título con el nombre real del residente, igual que UnitEdit usa el
// identificador real de la unidad.
function ResidentEditTitle() {
  const record = useRecordContext()
  return <AppPageTitle>{record?.name ?? ''}</AppPageTitle>
}

// Un Administrador que entra directo por URL a /residents/:id (sin
// pasar por ResidentShow, que ya le oculta el botón "Editar") se
// encuentra este mensaje en vez del formulario -- api/Residents.cs
// (RequireCanEditResidentAsync) rechaza el PUT igual si de algún modo
// se llegara a mandar, esto es solo para no mostrar un formulario que
// el servidor de todos modos va a rechazar. El record ya está cargado
// acá (Edit ya hizo el getOne), así que esto no dispara un pedido extra.
type ResidentRecord = { id: number; administrador: boolean; superAdministrador: boolean }

function ResidentEditGuard({ children }: { children: ReactNode }) {
  const record = useRecordContext<ResidentRecord>()
  const { permissions } = usePermissions<Permissions>()
  if (record && !canEditResident(permissions ?? null, record)) {
    return <AccessDenied />
  }
  return <>{children}</>
}

// Mismo formulario que ResidentCreate, precargado. El toolbar por
// defecto de SimpleForm en un <Edit> ya trae "Eliminar" además de
// "Guardar" — pero borrar puede chocar con una FK (pagos, códigos de
// acceso, etc. que referencian a este residente); ver el catch en
// api/Residents.cs. Desactivar (el campo "active") es la salida normal.
export function ResidentEdit() {
  const { permissions } = usePermissions<Permissions>()
  const canGrantSuperAdmin = canGrantSuperAdministrador(permissions ?? null)
  return (
    <Edit redirect="list">
      <ResidentEditGuard>
      <SimpleForm>
        <ResidentEditTitle />
        <AppFormRow>

          <AppFormCol span={2}>
            <BooleanInput source="active" />
          </AppFormCol>
          <AppFormCol span={4}>
            <BooleanInput
              source="receiveEmails"
              label="app.residents.receiveEmails"
              helperText="app.residents.receiveEmailsHelp"
            />
          </AppFormCol>
        </AppFormRow>
        <AppFormRow>
          <AppFormCol span={3}>
            <TextInput source="name" validate={required()} fullWidth />
          </AppFormCol>
          <AppFormCol span={3}>
            <TextInput source="phone" fullWidth />
          </AppFormCol>
          <AppFormCol span={3}>
            <TextInput source="email" fullWidth />
          </AppFormCol>
          <AppFormCol span={3}>
            <ReferenceInput source="unitId" reference="units">
              <AutocompleteInput optionText="identifier" fullWidth helperText="app.residents.unitHelp" />
            </ReferenceInput>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={4}>
            <BooleanInput source="residente" />
          </AppFormCol>
          <AppFormCol span={4}>
            <BooleanInput source="administrador" />
          </AppFormCol>
          {/* Solo un SuperAdministrador puede otorgar (o quitar) este rol
              -- ver RequireCanGrantSuperAdministrador en api/Residents.cs.
              Un Administrador ni siquiera llega a ver esta ficha si el
              residente es SuperAdministrador (api/Residents.cs excluye
              esa fila entera de GetResidents/GetResident), así que este
              caso solo se da entre SuperAdministradores. */}
          {canGrantSuperAdmin ? (
            <AppFormCol span={4}>
              <BooleanInput source="superAdministrador" />
            </AppFormCol>
          ) : null}
        </AppFormRow>

        {/* Colonia que este Administrador administra
            (dbo.Residents.NeighborhoodId, independiente de unitId) --
            solo un SuperAdministrador puede asignarla (ver
            RequireCanAssignNeighborhood en api/Residents.cs). */}
        {canGrantSuperAdmin ? (
          <AppFormRow>
            <AppFormCol span={6}>
              <ReferenceInput source="neighborhoodId" reference="neighborhoods">
                <AutocompleteInput
                  optionText="name"
                  label="app.residents.administeredNeighborhood"
                  fullWidth
                  helperText="app.residents.administeredNeighborhoodHelp"
                />
              </ReferenceInput>
            </AppFormCol>
          </AppFormRow>
        ) : null}
      </SimpleForm>
      </ResidentEditGuard>
    </Edit>
  )
}
