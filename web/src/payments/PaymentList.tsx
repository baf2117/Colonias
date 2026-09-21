import { useState } from 'react'
import { Autocomplete, Box, MenuItem, TextField as MuiTextField } from '@mui/material'
import {
  CreateButton,
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
import { AppPageTitle } from '../components/AppPageTitle'
import { isPureResident } from '../components/RequireRole'
import { PaymentPeriodField } from './PaymentPeriodField'
import { PaymentStatusField } from './PaymentStatusField'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const STATUSES = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'approved', label: 'Aprobado' },
  { value: 'rejected', label: 'Rechazado' },
]

// Mismo patrón que VendorFilter en ExpenseList: armado a mano (no con el
// prop `filters` de <List> ni con <ReferenceInput>/<AutocompleteInput>)
// para que el título centrado (AppPageTitle) no se descentre cuando hay
// un filtro alwaysOn — ver el comentario largo en ExpenseList.tsx.
function UnitFilter() {
  const { filterValues, setFilters } = useListContext()
  const [inputValue, setInputValue] = useState('')

  const { data: units, isLoading } = useGetList('units', {
    pagination: { page: 1, perPage: 25 },
    sort: { field: 'identifier', order: 'ASC' },
    filter: inputValue ? { q: inputValue } : {},
  })
  const { data: selectedUnit } = useGetOne(
    'units',
    { id: filterValues.unitId },
    { enabled: !!filterValues.unitId },
  )

  return (
    <Autocomplete
      size="small"
      fullWidth
      options={units ?? []}
      loading={isLoading}
      getOptionLabel={(option) => option.identifier ?? ''}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      value={selectedUnit ?? null}
      onChange={(_event, newValue) => {
        const { unitId: _omit, ...rest } = filterValues
        setFilters(newValue ? { ...rest, unitId: newValue.id } : rest, null)
      }}
      onInputChange={(_event, newInputValue) => setInputValue(newInputValue)}
      renderInput={(params) => <MuiTextField {...params} label="Unidad" />}
    />
  )
}

function StatusFilter() {
  const { filterValues, setFilters } = useListContext()

  const setFilter = (value: string) => {
    const { status: _omit, ...rest } = filterValues
    setFilters(value === '' ? rest : { ...rest, status: value }, null)
  }

  return (
    <MuiTextField
      select
      size="small"
      fullWidth
      label="Estado"
      value={filterValues.status ?? ''}
      onChange={(event) => setFilter(event.target.value)}
    >
      <MenuItem value="">Todos</MenuItem>
      {STATUSES.map((status) => (
        <MenuItem key={status.value} value={status.value}>
          {status.label}
        </MenuItem>
      ))}
    </MuiTextField>
  )
}

// Mes y año de Period, mismo criterio que MonthFilter/YearFilter en
// ExpenseList.tsx (api/Payments.cs los traduce a MONTH(Period)/YEAR(Period)).
function MonthFilter() {
  const { filterValues, setFilters } = useListContext()

  const setFilter = (value: number | '') => {
    const { month: _omit, ...rest } = filterValues
    setFilters(value === '' ? rest : { ...rest, month: value }, null)
  }

  return (
    <MuiTextField
      select
      size="small"
      fullWidth
      label="Mes"
      value={filterValues.month ?? ''}
      onChange={(event) => setFilter(event.target.value === '' ? '' : Number(event.target.value))}
    >
      <MenuItem value="">Todos</MenuItem>
      {MONTHS.map((month, index) => (
        <MenuItem key={month} value={index + 1}>
          {month}
        </MenuItem>
      ))}
    </MuiTextField>
  )
}

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

const PaymentListActions = () => {
  const translate = useTranslate()
  const { permissions } = usePermissions<Permissions>()
  // Un residente puro no elige unidad: el backend (api/Payments.cs) ya le
  // fuerza la suya, así que el filtro no aporta nada y solo confundiría
  // (parecería que podría ver otras unidades). Ver isPureResident en
  // RequireRole.tsx.
  const showUnitFilter = !isPureResident(permissions ?? null)
  return (
    <TopToolbar sx={{ width: '100%', flexDirection: 'column', alignItems: 'stretch', mt: 3, mb: 1 }}>
      <AppPageTitle sx={{ mb: 0 }}>{translate('resources.payments.name', { smart_count: 2 })}</AppPageTitle>
      <AppFormRow sx={{ mt: 2, alignItems: 'center' }}>
        {showUnitFilter ? (
          <AppFormCol span={3}>
            <UnitFilter />
          </AppFormCol>
        ) : null}
        <AppFormCol span={showUnitFilter ? 3 : 4}>
          <StatusFilter />
        </AppFormCol>
        <AppFormCol span={showUnitFilter ? 2 : 3}>
          <MonthFilter />
        </AppFormCol>
        <AppFormCol span={showUnitFilter ? 2 : 3}>
          <YearFilter />
        </AppFormCol>
        <AppFormCol span={2}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <CreateButton />
          </Box>
        </AppFormCol>
      </AppFormRow>
    </TopToolbar>
  )
}

// El monto se muestra como número simple (sin símbolo de moneda), mismo
// criterio que ExpenseList: resolver la moneda por fila (Unit ->
// Neighborhood) saldría caro en una lista de muchos pagos. PaymentShow sí
// la resuelve, porque ahí es un solo registro.
export function PaymentList() {
  const { permissions } = usePermissions<Permissions>()
  // Mismo criterio que el filtro de arriba: si todos los pagos listados
  // son de su propia unidad, la columna Unidad es información repetida.
  const showUnitColumn = !isPureResident(permissions ?? null)
  return (
    <List actions={<PaymentListActions />} sort={{ field: 'period', order: 'DESC' }}>
      <AppDatagrid rowClick="show" bulkActionButtons={false}>
        {showUnitColumn ? (
          <ReferenceField source="unitId" reference="units">
            <TextField source="identifier" />
          </ReferenceField>
        ) : null}
        <PaymentPeriodField label="Mes" />
        <NumberField source="amount" options={{ minimumFractionDigits: 2 }} />
        <PaymentStatusField label="Estado" />
      </AppDatagrid>
    </List>
  )
}
