import { useState } from 'react'
import { Autocomplete, Box, MenuItem, TextField as MuiTextField } from '@mui/material'
import {
  CreateButton,
  DateField,
  List,
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
import { PaymentPeriodField } from '../payments/PaymentPeriodField'
import { BankStatementBalanceField, BankStatementNeighborhoodField } from './BankStatementFields'

// Filtros armados a mano dentro de las actions (no con el prop `filters`
// de <List>), mismo motivo que ExpenseList.tsx: mantener el título
// centrado.
function YearFilter() {
  const { filterValues, setFilters } = useListContext()
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
      label="Año"
      value={filterValues.year ?? ''}
      onChange={(event) => setFilter(event.target.value === '' ? '' : Number(event.target.value))}
    >
      <MenuItem value="">Todos</MenuItem>
      {years.map((year) => (
        <MenuItem key={year} value={year}>
          {year}
        </MenuItem>
      ))}
    </MuiTextField>
  )
}

// Solo para SuperAdministrador: a un Administrador el API ya le muestra
// únicamente los de su colonia.
function NeighborhoodFilter() {
  const { filterValues, setFilters } = useListContext()
  const [inputValue, setInputValue] = useState('')

  const { data: neighborhoods, isLoading } = useGetList('neighborhoods', {
    pagination: { page: 1, perPage: 100 },
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
      renderInput={(params) => <MuiTextField {...params} label="Colonia" />}
    />
  )
}

const BankStatementListActions = () => {
  const translate = useTranslate()
  const { permissions } = usePermissions<Permissions>()
  const isSuperAdmin = isSuperAdministrador(permissions ?? null)
  return (
    <TopToolbar sx={{ width: '100%', flexDirection: 'column', alignItems: 'stretch', mt: 3, mb: 1 }}>
      <AppPageTitle sx={{ mb: 0 }}>{translate('resources.bank-statements.name', { smart_count: 2 })}</AppPageTitle>
      <AppFormRow sx={{ mt: 2, alignItems: 'center' }}>
        {isSuperAdmin ? (
          <AppFormCol span={3}>
            <NeighborhoodFilter />
          </AppFormCol>
        ) : null}
        <AppFormCol span={2}>
          <YearFilter />
        </AppFormCol>
        <AppFormCol span={isSuperAdmin ? 7 : 10}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <CreateButton label="Subir estado de cuenta" />
          </Box>
        </AppFormCol>
      </AppFormRow>
    </TopToolbar>
  )
}

export function BankStatementList() {
  const { permissions } = usePermissions<Permissions>()
  const isSuperAdmin = isSuperAdministrador(permissions ?? null)
  return (
    <List actions={<BankStatementListActions />} sort={{ field: 'period', order: 'DESC' }}>
      <AppDatagrid rowClick="show" bulkActionButtons={false}>
        <PaymentPeriodField label="Mes" />
        {isSuperAdmin ? <BankStatementNeighborhoodField label="Colonia" /> : null}
        <BankStatementBalanceField label="Saldo según el banco" />
        <DateField source="createdAt" />
      </AppDatagrid>
    </List>
  )
}
