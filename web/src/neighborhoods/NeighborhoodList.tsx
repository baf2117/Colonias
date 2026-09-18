import { Box } from '@mui/material'
import { BooleanField, CreateButton, List, TextField, TopToolbar, useTranslate } from 'react-admin'
import { AppDatagrid } from '../components/AppDatagrid'
import { AppPageTitle } from '../components/AppPageTitle'

// Primera pantalla real del SuperUsuario: lista de colonias. El título
// ("Colonias") sale del mismo nombre de recurso que ya usan las
// traducciones (i18n/es.ts) en vez de texto fijo, así que cambia solo si
// el recurso se renombra o el idioma se cambia a inglés.
//
// Título y botón "Crear" NO van en la misma fila a propósito: el título
// queda arriba, centrado, en su propia línea; el botón va en una fila
// aparte debajo, alineado a la derecha — dos niveles, no uno solo.
//
// rowClick="show": al haber un NeighborhoodShow registrado en App.tsx,
// hacer clic en una fila lleva a ver esa colonia.
const NeighborhoodListActions = () => {
  const translate = useTranslate()
  return (
    <TopToolbar sx={{ width: '100%', flexDirection: 'column', alignItems: 'stretch', mt: 3, mb: 1 }}>
      <AppPageTitle sx={{ mb: 0 }}>{translate('resources.neighborhoods.name', { smart_count: 2 })}</AppPageTitle>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <CreateButton />
      </Box>
    </TopToolbar>
  )
}

export function NeighborhoodList() {
  return (
    <List actions={<NeighborhoodListActions />}>
      <AppDatagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="name" />
        <BooleanField source="active" />
      </AppDatagrid>
    </List>
  )
}
