import { Box } from '@mui/material'
import { BooleanField, CreateButton, DateField, List, ReferenceField, TextField, TopToolbar, useTranslate } from 'react-admin'
import { AppDatagrid } from '../components/AppDatagrid'
import { AppPageTitle } from '../components/AppPageTitle'

// Mismo patrón que ResidentList/UnitList: título arriba centrado en su
// propia línea, botón "Crear" debajo alineado a la derecha, rowClick="show".
const SecurityStaffListActions = () => {
  const translate = useTranslate()
  return (
    <TopToolbar sx={{ width: '100%', flexDirection: 'column', alignItems: 'stretch', mt: 3, mb: 1 }}>
      <AppPageTitle sx={{ mb: 0 }}>{translate('resources.security-staff.name', { smart_count: 2 })}</AppPageTitle>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <CreateButton />
      </Box>
    </TopToolbar>
  )
}

// Un guardia no es un Resident: pertenece directo a una colonia
// (NeighborhoodId), no a una unidad. Ver api/SecurityStaff.cs.
export function SecurityStaffList() {
  return (
    <List actions={<SecurityStaffListActions />}>
      <AppDatagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="name" />
        <ReferenceField source="neighborhoodId" reference="neighborhoods">
          <TextField source="name" />
        </ReferenceField>
        <TextField source="phone" emptyText="—" />
        <DateField source="hireDate" emptyText="—" />
        <BooleanField source="active" />
      </AppDatagrid>
    </List>
  )
}
