import { useState } from 'react'
import { Autocomplete, Box, MenuItem, TextField as MuiTextField } from '@mui/material'
import {
  CreateButton,
  DateField,
  List,
  NumberField,
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
import { monthNames, useFormatLocale } from '../i18n/useFormatLocale'
import { AppPageTitle } from '../components/AppPageTitle'
import { isSuperAdministrador } from '../components/RequireRole'


// Proveedor es la "agrupación por proveedor" que pidió el usuario: no un
// GROUP BY en la base, sino un filtro (filter.vendorId) resuelto por
// api/Expenses.cs. No se arma con el prop `filters` de <List> ni con
// <ReferenceInput>/<AutocompleteInput> a propósito: react-admin pone la
// barra de filtros y el prop `actions` en la misma fila flex
// (ListToolbar, space-between), así que en cuanto hay un filtro "alwaysOn"
// el bloque de actions (título + botón Crear) deja de tener el ancho
// completo y el título centrado (AppPageTitle) queda descentrado. Armar
// el filtro a mano acá adentro, en la misma fila que ya controlamos en
// ExpenseListActions, evita ese problema — mismo criterio que ya se usó
// en CreateVendorDialog para el selector de Colonia (sin form de
// react-admin alrededor, con useGetList/useGetOne a mano).
//
// fullWidth (en vez de un sx={{ minWidth: '...px' }} fijo) es lo que
// deja que el ancho salga de la columna de AppFormCol que lo contiene
// (ver ExpenseListActions) — igual que cualquier campo de un formulario
// del proyecto, responsive por construcción en vez de un tamaño fijo en
// píxeles.
function VendorFilter() {
  const { filterValues, setFilters } = useListContext()
  const translate = useTranslate()
  const [inputValue, setInputValue] = useState('')

  const { data: vendors, isLoading } = useGetList('vendors', {
    pagination: { page: 1, perPage: 25 },
    sort: { field: 'name', order: 'ASC' },
    filter: inputValue ? { q: inputValue } : {},
  })
  const { data: selectedVendor } = useGetOne(
    'vendors',
    { id: filterValues.vendorId },
    { enabled: !!filterValues.vendorId },
  )

  return (
    <Autocomplete
      size="small"
      fullWidth
      options={vendors ?? []}
      loading={isLoading}
      getOptionLabel={(option) => option.name ?? ''}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      value={selectedVendor ?? null}
      onChange={(_event, newValue) => {
        const { vendorId: _omit, ...rest } = filterValues
        setFilters(newValue ? { ...rest, vendorId: newValue.id } : rest, null)
      }}
      onInputChange={(_event, newInputValue) => setInputValue(newInputValue)}
      renderInput={(params) => <MuiTextField {...params} label={translate('app.common.vendor')} />}
    />
  )
}

// Mes y año del gasto (Date), independientes entre sí — api/Expenses.cs
// los traduce a MONTH(Date)/YEAR(Date). Van a mano, no con <SelectInput>
// dentro del prop `filters`, por la misma razón que VendorFilter de
// arriba (mantener el título centrado). fullWidth por el mismo motivo:
// el ancho lo da la columna de AppFormCol, no un valor fijo en píxeles.
function MonthFilter() {
  const { filterValues, setFilters } = useListContext()
  const translate = useTranslate()
  const formatLocale = useFormatLocale()

  const setFilter = (value: number | '') => {
    const { month: _omit, ...rest } = filterValues
    setFilters(value === '' ? rest : { ...rest, month: value }, null)
  }

  return (
    <MuiTextField
      select
      size="small"
      fullWidth
      label={translate('app.common.month')}
      value={filterValues.month ?? ''}
      onChange={(event) => setFilter(event.target.value === '' ? '' : Number(event.target.value))}
    >
      <MenuItem value="">{translate('app.common.all')}</MenuItem>
      {monthNames(formatLocale).map((month, index) => (
        <MenuItem key={month} value={index + 1}>
          {month}
        </MenuItem>
      ))}
    </MuiTextField>
  )
}

function YearFilter() {
  const { filterValues, setFilters } = useListContext()
  const translate = useTranslate()
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i)

  const setFilter = (value: number | '') => {
    const { year: _omit, ...rest } = filterValues
    setFilters(value === '' ? rest : { ...rest, year: value }, null)
  }

  return (
    <MuiTextField
      select
      size="small"
      fullWidth
      label={translate('app.common.year')}
      value={filterValues.year ?? ''}
      onChange={(event) => setFilter(event.target.value === '' ? '' : Number(event.target.value))}
    >
      <MenuItem value="">{translate('app.common.all')}</MenuItem>
      {years.map((year) => (
        <MenuItem key={year} value={year}>
          {year}
        </MenuItem>
      ))}
    </MuiTextField>
  )
}

// Colonia, solo para SuperAdministrador -- un Administrador ya está
// acotado a la suya del lado del servidor (Vendors.cs/Units.cs), así
// que este filtro no le aporta nada. Mismo patrón manual que
// VendorFilter, misma razón (mantener el título centrado).
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

// Título arriba centrado en su propia línea (igual que UnitList), y
// debajo una fila con los filtros y "Crear" repartidos en la misma
// grilla de 12 columnas que usa cualquier formulario del proyecto
// (AppFormRow/AppFormCol) — así el ancho de cada filtro es proporcional
// al ancho de la pantalla (responsive), no un valor fijo en píxeles.
// Todo esto vive dentro de ExpenseListActions para que el título siga
// ocupando el ancho completo sin que la barra de filtros de react-admin
// lo empuje (ver el comentario de VendorFilter arriba).
const ExpenseListActions = () => {
  const translate = useTranslate()
  const { permissions } = usePermissions<Permissions>()
  const showNeighborhoodFilter = isSuperAdministrador(permissions ?? null)
  return (
    <TopToolbar sx={{ width: '100%', flexDirection: 'column', alignItems: 'stretch', mt: 3, mb: 1 }}>
      <AppPageTitle sx={{ mb: 0 }}>{translate('resources.expenses.name', { smart_count: 2 })}</AppPageTitle>
      <AppFormRow sx={{ mt: 2, alignItems: 'center' }}>
        <AppFormCol span={showNeighborhoodFilter ? 3 : 4}>
          <VendorFilter />
        </AppFormCol>
        <AppFormCol span={2}>
          <MonthFilter />
        </AppFormCol>
        <AppFormCol span={2}>
          <YearFilter />
        </AppFormCol>
        {showNeighborhoodFilter ? (
          <AppFormCol span={2}>
            <NeighborhoodFilter />
          </AppFormCol>
        ) : null}
        <AppFormCol span={3}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <CreateButton />
          </Box>
        </AppFormCol>
      </AppFormRow>
    </TopToolbar>
  )
}

// El monto se muestra como número simple, sin símbolo de moneda: cada
// gasto puede pertenecer a un proveedor de una colonia distinta (con su
// propia Currency), y resolver esa moneda por fila en una lista de
// muchos gastos saldría caro (dos saltos: Vendor -> Neighborhood, por
// cada fila). ExpenseShow sí la resuelve y la muestra con la moneda
// real, porque ahí es un solo registro.
export function ExpenseList() {
  return (
    <List actions={<ExpenseListActions />} sort={{ field: 'date', order: 'DESC' }}>
      <AppDatagrid rowClick="show" bulkActionButtons={false}>
        <DateField source="date" />
        <ReferenceField source="vendorId" reference="vendors">
          <TextField source="name" />
        </ReferenceField>
        <TextField source="category" />
        <NumberField source="amount" options={{ minimumFractionDigits: 2 }} />
      </AppDatagrid>
    </List>
  )
}
