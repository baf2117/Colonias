import { useState } from 'react'
import { Autocomplete, Box, TextField as MuiTextField } from '@mui/material'
import {
  BooleanField,
  CreateButton,
  List,
  ReferenceField,
  TextField,
  TopToolbar,
  useGetList,
  useGetOne,
  useListContext,
  usePermissions,
  useTranslate,
} from 'react-admin'
import type { Permissions } from '../authProvider'
import { AppDatagrid } from '../components/AppDatagrid'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'
import { isSuperAdministrador } from '../components/RequireRole'

// Filtro por colonia, solo para SuperAdministrador -- un Administrador
// ni lo necesita ni lo ve: api/Units.cs (ResolveNeighborhoodScope) ya lo
// acota del lado del servidor a la colonia que tiene asignada
// (dbo.Residents.NeighborhoodId), así que mostrarle este filtro no
// tendría sentido (siempre iba a dar la misma única colonia).
//
// Armado a mano (no con el prop `filters` de <List> ni con
// <ReferenceInput>/<AutocompleteInput>), mismo motivo que VendorFilter
// en ExpenseList.tsx: react-admin pone la barra de filtros y el prop
// `actions` en la misma fila flex (ListToolbar, space-between), así que
// en cuanto hay un filtro "alwaysOn" el bloque de actions (título +
// botón Crear) deja de tener el ancho completo y el título centrado
// (AppPageTitle) queda descentrado. Armarlo acá adentro, en la misma
// fila que ya controla UnitListActions, evita ese problema.
function NeighborhoodFilter() {
  const { filterValues, setFilters } = useListContext()
  const translate = useTranslate()
  const [inputValue, setInputValue] = useState('')

  const { data: neighborhoods, isLoading } = useGetList('neighborhoods', {
    pagination: { page: 1, perPage: 25 },
    sort: { field: 'name', order: 'ASC' },
    filter: inputValue ? { q: inputValue } : {},
  })
  const { data: selectedNeighborhood } = useGetOne(
    'neighborhoods',
    { id: filterValues.neighborhoodId },
    { enabled: !!filterValues.neighborhoodId },
  )

  return (
    <Autocomplete
      size="small"
      fullWidth
      options={neighborhoods ?? []}
      loading={isLoading}
      getOptionLabel={(option) => option.name ?? ''}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      value={selectedNeighborhood ?? null}
      onChange={(_event, newValue) => {
        const { neighborhoodId: _omit, ...rest } = filterValues
        setFilters(newValue ? { ...rest, neighborhoodId: newValue.id } : rest, null)
      }}
      onInputChange={(_event, newInputValue) => setInputValue(newInputValue)}
      renderInput={(params) => <MuiTextField {...params} label={translate('app.common.neighborhood')} />}
    />
  )
}

// Mismo patrón que ExpenseListActions/PaymentListActions: título arriba
// centrado en su propia línea, filtro (si corresponde) y "Crear" debajo
// en la grilla de 12 columnas del proyecto.
const UnitListActions = () => {
  const translate = useTranslate()
  const { permissions } = usePermissions<Permissions>()
  const showNeighborhoodFilter = isSuperAdministrador(permissions ?? null)
  return (
    <TopToolbar sx={{ width: '100%', flexDirection: 'column', alignItems: 'stretch', mt: 3, mb: 1 }}>
      <AppPageTitle sx={{ mb: 0 }}>{translate('resources.units.name', { smart_count: 2 })}</AppPageTitle>
      {showNeighborhoodFilter ? (
        <AppFormRow sx={{ mt: 2, alignItems: 'center' }}>
          <AppFormCol span={2}>
            <NeighborhoodFilter />
          </AppFormCol>
          <AppFormCol span={10}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <CreateButton />
            </Box>
          </AppFormCol>
        </AppFormRow>
      ) : (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <CreateButton />
        </Box>
      )}
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
