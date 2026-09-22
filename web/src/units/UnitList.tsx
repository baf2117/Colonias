import { Box } from '@mui/material'
import {
  AutocompleteInput,
  BooleanField,
  CreateButton,
  List,
  ReferenceField,
  ReferenceInput,
  TextField,
  TopToolbar,
  usePermissions,
  useTranslate,
} from 'react-admin'
import type { Permissions } from '../authProvider'
import { AppDatagrid } from '../components/AppDatagrid'
import { AppPageTitle } from '../components/AppPageTitle'
import { isSuperAdministrador } from '../components/RequireRole'

// Mismo patrón que NeighborhoodList: título arriba centrado en su propia
// línea, botón "Crear" debajo alineado a la derecha (no comparten fila),
// y rowClick="show" para ir al detalle de la unidad al hacer clic.
const UnitListActions = () => {
  const translate = useTranslate()
  return (
    <TopToolbar sx={{ width: '100%', flexDirection: 'column', alignItems: 'stretch', mt: 3, mb: 1 }}>
      <AppPageTitle sx={{ mb: 0 }}>{translate('resources.units.name', { smart_count: 2 })}</AppPageTitle>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <CreateButton />
      </Box>
    </TopToolbar>
  )
}

// Filtro por colonia, solo para SuperAdministrador -- un Administrador
// ni lo necesita ni lo ve: api/Units.cs (ResolveNeighborhoodScope) ya lo
// acota del lado del servidor a la colonia que tiene asignada
// (dbo.Residents.NeighborhoodId), así que mostrarle este filtro no
// tendría sentido (siempre iba a dar la misma única colonia).
const unitFilters = [
  <ReferenceInput key="neighborhoodId" source="neighborhoodId" reference="neighborhoods" alwaysOn>
    <AutocompleteInput optionText="name" label="Colonia" />
  </ReferenceInput>,
]

export function UnitList() {
  const { permissions } = usePermissions<Permissions>()
  const filters = isSuperAdministrador(permissions ?? null) ? unitFilters : undefined
  return (
    <List actions={<UnitListActions />} filters={filters}>
      <AppDatagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="identifier" />
        <TextField source="address" />
        <BooleanField source="active" />
        <ReferenceField source="neighborhoodId" reference="neighborhoods">
          <TextField source="name" />
        </ReferenceField>
      </AppDatagrid>
    </List>
  )
}
