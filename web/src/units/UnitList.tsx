import { Box } from '@mui/material'
import { BooleanField, CreateButton, List, ReferenceField, TextField, TopToolbar, useTranslate } from 'react-admin'
import { AppDatagrid } from '../components/AppDatagrid'
import { AppPageTitle } from '../components/AppPageTitle'

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

export function UnitList() {
  return (
    <List actions={<UnitListActions />}>
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
