import { Box, Typography } from '@mui/material'
import {
  BooleanField,
  CreateButton,
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
import { ResidentRolesField } from '../residents/ResidentList'
import { useFormatLocale } from '../i18n/useFormatLocale'

// Título con el identificador real de la unidad (no "Unidad" genérico),
// igual que NeighborhoodShow usa el nombre real de la colonia.
function UnitShowTitle() {
  const record = useRecordContext()
  return <AppPageTitle>{record?.identifier ?? ''}</AppPageTitle>
}

// Botón "Editar" arriba del contenido: la puerta a UnitEdit. No pasa por
// el título (portal #react-admin-title que este proyecto no tiene, ver
// AppTopBar.tsx) — el prop `actions` de <Show> se renderiza aparte, así
// que funciona igual sin ese portal.
const UnitShowActions = () => (
  <TopToolbar>
    <EditButton />
  </TopToolbar>
)

// feeAmount es un monto suelto (no trae su propia moneda): la unidad
// solo sabe a qué colonia pertenece, y la moneda vive en
// Neighborhoods.Currency (migración 0007). Por eso, a diferencia de un
// NumberField con options={{ currency: '...' }} fijo, este componente
// busca la colonia de la unidad (useGetOne) y formatea con esa moneda
// real — si no, toda unidad se vería en la misma moneda aunque su
// colonia use otra.
function UnitFeeAmountField() {
  const record = useRecordContext<{ feeAmount: number | null; neighborhoodId: number }>()
  const translate = useTranslate()
  const formatLocale = useFormatLocale()
  const { data: neighborhood } = useGetOne(
    'neighborhoods',
    { id: record?.neighborhoodId },
    { enabled: !!record?.neighborhoodId },
  )

  if (record?.feeAmount == null) {
    return <span>{translate('app.units.usesNeighborhoodFee')}</span>
  }
  if (!neighborhood) {
    return null
  }
  return <span>{new Intl.NumberFormat(formatLocale, { style: 'currency', currency: neighborhood.currency }).format(record.feeAmount)}</span>
}

// Residentes de esta unidad (Residents.UnitId → Units.UnitId).
// ReferenceManyField con target="unitId" reusa el filtro que
// GetResidents ya soporta (filter.unitId), sin endpoint aparte. El
// botón "Nuevo residente" precarga unitId en ResidentCreate vía
// `state={{ record: { unitId } }}` (patrón estándar de react-admin
// para prellenar un Create desde afuera) — no hay que elegir la
// unidad a mano al crear un residente desde acá.
function UnitResidentsSection() {
  const record = useRecordContext()
  const translate = useTranslate()
  if (!record) return null
  return (
    <Box sx={{ width: '100%', mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">{translate('resources.residents.name', { smart_count: 2 })}</Typography>
        <CreateButton resource="residents" label="app.units.newResident" state={{ record: { unitId: record.id } }} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {translate('app.common.selfRegisterHint')}
      </Typography>
      <ReferenceManyField reference="residents" target="unitId" label={false}>
        <AppDatagrid rowClick="show" bulkActionButtons={false}>
          <TextField source="name" />
          <ResidentRolesField label="app.residents.roles" />
          <BooleanField source="active" />
        </AppDatagrid>
      </ReferenceManyField>
    </Box>
  )
}

// Misma pantalla de referencia que NeighborhoodShow (título + AppFormRow/
// AppFormCol de 12 columnas, solo lectura). <Labeled source="..."> en
// cada campo porque, al no ser hijos directos de SimpleShowLayout, no
// reciben el título automático que ese componente le pone a sus hijos
// (ver la misma nota en NeighborhoodShow.tsx).
export function UnitShow() {
  return (
    <Show actions={<UnitShowActions />}>
      <SimpleShowLayout>
        <UnitShowTitle />

        <AppFormRow>
          <AppFormCol span={3}>
            <Labeled source="active">
              <BooleanField source="active" />
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
            <Labeled source="identifier">
              <TextField source="identifier" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="address">
              <TextField source="address" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="feeAmount">
              <UnitFeeAmountField />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled label="app.units.registrationCode">
              <TextField source="registrationCode" />
            </Labeled>
          </AppFormCol>
        </AppFormRow>

        <UnitResidentsSection />
      </SimpleShowLayout>
    </Show>
  )
}
