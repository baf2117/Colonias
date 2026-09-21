import { Box } from '@mui/material'
import { BooleanField, CreateButton, List, ReferenceField, TextField, TopToolbar, useRecordContext, useTranslate } from 'react-admin'
import { AppDatagrid } from '../components/AppDatagrid'
import { AppPageTitle } from '../components/AppPageTitle'

// Roles como texto en vez de tres columnas de BooleanField: Residents
// fusionó dbo.Users y dbo.Residents (ver schema.sql y el diagrama ER) y
// una misma fila puede tener varias banderas prendidas a la vez
// (Administrador, SuperAdministrador, Residente) — una lista corta
// separada por comas se lee más rápido en la grilla que varias
// columnas de check.
const ROLE_LABELS = {
  administrador: 'Administrador',
  superAdministrador: 'Superadministrador',
  residente: 'Residente',
} as const

export function ResidentRolesField() {
  const record = useRecordContext<Record<keyof typeof ROLE_LABELS, boolean>>()
  if (!record) return null
  const roles = (Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[])
    .filter((key) => record[key])
    .map((key) => ROLE_LABELS[key])
  return <span>{roles.length > 0 ? roles.join(', ') : '—'}</span>
}

// Mismo patrón que UnitList: título arriba centrado en su propia línea,
// botón "Crear" debajo alineado a la derecha, rowClick="show".
const ResidentListActions = () => {
  const translate = useTranslate()
  return (
    <TopToolbar sx={{ width: '100%', flexDirection: 'column', alignItems: 'stretch', mt: 3, mb: 1 }}>
      <AppPageTitle sx={{ mb: 0 }}>{translate('resources.residents.name', { smart_count: 2 })}</AppPageTitle>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <CreateButton />
      </Box>
    </TopToolbar>
  )
}

// unitId puede ser null (administrador sin unidad propia) — emptyText
// en el ReferenceField evita que react-admin no muestre nada en esa
// fila.
export function ResidentList() {
  return (
    <List actions={<ResidentListActions />}>
      <AppDatagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="name" />
        <ReferenceField source="unitId" reference="units" emptyText="—">
          <TextField source="identifier" />
        </ReferenceField>
        <ResidentRolesField label="Roles" />
        <BooleanField source="active" />
      </AppDatagrid>
    </List>
  )
}
