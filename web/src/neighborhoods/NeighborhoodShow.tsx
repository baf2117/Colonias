import { Box, Typography } from '@mui/material'
import {
  BooleanField,
  CreateButton,
  EditButton,
  Labeled,
  ReferenceManyField,
  Show,
  SimpleShowLayout,
  TextField,
  TopToolbar,
  useRecordContext,
  useTranslate,
} from 'react-admin'
import { AppDatagrid } from '../components/AppDatagrid'
import { useFormatLocale } from '../i18n/useFormatLocale'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'

// El monto no se formatea con una moneda fija: cada colonia tiene la
// suya (currency, migración 0007), así que se lee del mismo registro
// y se arma con Intl.NumberFormat en vez de un NumberField con
// options={{ currency: '...' }} fijo (eso hubiera mostrado GTQ incluso
// para una colonia en USD).
function NeighborhoodFeeAmountField() {
  const record = useRecordContext<{ defaultFeeAmount: number; currency: string }>()
  const formatLocale = useFormatLocale()
  if (!record) return null
  return <span>{new Intl.NumberFormat(formatLocale, { style: 'currency', currency: record.currency }).format(record.defaultFeeAmount)}</span>
}

// Título con el nombre real de la colonia (no "Colonia" genérico): así
// se sabe cuál de todas se está viendo. useRecordContext funciona acá
// porque este componente se renderiza adentro de <SimpleShowLayout>, ya
// con el registro cargado.
function NeighborhoodShowTitle() {
  const record = useRecordContext()
  return <AppPageTitle>{record?.name ?? ''}</AppPageTitle>
}

// Botón "Editar" arriba del contenido — la puerta a NeighborhoodEdit,
// igual que en UnitShow. Es lo que permite cambiar la cuota general
// después de creada la colonia.
const NeighborhoodShowActions = () => (
  <TopToolbar>
    <EditButton />
  </TopToolbar>
)

// Guardias de esta colonia (SecurityStaff.NeighborhoodId → Neighborhoods.
// NeighborhoodId), mismo patrón que UnitResidentsSection en UnitShow.tsx.
// El botón "Nuevo guardia" precarga neighborhoodId en SecurityStaffCreate.
function NeighborhoodStaffSection() {
  const record = useRecordContext()
  const translate = useTranslate()
  if (!record) return null
  return (
    <Box sx={{ width: '100%', mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">{translate('resources.security-staff.name', { smart_count: 2 })}</Typography>
        <CreateButton resource="security-staff" label="app.neighborhoods.newGuard" state={{ record: { neighborhoodId: record.id } }} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {translate('app.common.selfRegisterHint')}
      </Typography>
      <ReferenceManyField reference="security-staff" target="neighborhoodId" label={false}>
        <AppDatagrid rowClick="show" bulkActionButtons={false}>
          <TextField source="name" />
          <TextField source="phone" emptyText="—" />
          <BooleanField source="active" />
        </AppDatagrid>
      </ReferenceManyField>
    </Box>
  )
}

// Misma pantalla de referencia que NeighborhoodCreate (título +
// AppFormRow/AppFormCol de 12 columnas), pero de solo lectura: se llega
// acá haciendo clic en una fila de la lista (rowClick="show" en
// NeighborhoodList). El título no se pasa como prop `title` de <Show> —
// ese título va a un portal (#react-admin-title) que el AppBar del
// proyecto no tiene (ver AppTopBar.tsx), así que directamente se
// renderiza a mano adentro del layout, como en NeighborhoodCreate.
//
// <Labeled source="..."> en cada campo: SimpleShowLayout normalmente le
// pone el título de arriba a cada campo envolviendo automáticamente a
// sus hijos directos, pero acá los campos están dentro de AppFormRow/
// AppFormCol (no son hijos directos), así que ese envoltorio automático
// no llega a pasar.
export function NeighborhoodShow() {
  return (
    <Show actions={<NeighborhoodShowActions />}>
      <SimpleShowLayout>
        <NeighborhoodShowTitle />

        <AppFormRow>
          <AppFormCol span={3}>
            <Labeled source="active">
              <BooleanField source="active" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="temporaryCodesEnabled">
              <BooleanField source="temporaryCodesEnabled" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="permanentCodesEnabled">
              <BooleanField source="permanentCodesEnabled" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="denyAccessEnabled">
              <BooleanField source="denyAccessEnabled" />
            </Labeled>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={6}>
            <Labeled source="name">
              <TextField source="name" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="defaultFeeAmount">
              <NeighborhoodFeeAmountField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="currency">
              <TextField source="currency" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled label="app.neighborhoods.staffRegistrationCode">
              <TextField source="staffRegistrationCode" />
            </Labeled>
          </AppFormCol>
        </AppFormRow>

        <NeighborhoodStaffSection />
      </SimpleShowLayout>
    </Show>
  )
}
