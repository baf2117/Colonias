import { MenuItem, TextField } from '@mui/material'
import { InputHelperText, useInput, useTranslate, type Validator } from 'react-admin'
import { formatMonthYear, useFormatLocale } from '../i18n/useFormatLocale'

// Selector de mes ("Septiembre 2026") para los campos Period del proyecto
// (Payments, Payroll, BankStatements), que en la base son el día 1 del
// mes. Reemplaza a <DateInput>, que pedía un día puntual que no existe.
// Es una lista desplegable y no <input type="month">, que en Firefox y
// Safari de escritorio se ve como un cuadro de texto.
//
// Guarda "YYYY-MM-01" en el formulario; acepta de entrada cualquier fecha
// ("2026-09-22", "2026-09-01T00:00:00") y la lleva a su mes.

// Rango por defecto de la lista (respecto del mes en curso). Cada pantalla
// puede acotarlo con monthsBack/monthsAhead (p.ej. PaymentCreate).
const DEFAULT_MONTHS_BACK = 24
const DEFAULT_MONTHS_AHEAD = 6

function monthKey(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}/.test(value)) return null
  return value.slice(0, 7)
}

function monthLabel(key: string, formatLocale: string): string {
  const [year, month] = key.split('-').map(Number)
  return formatMonthYear(new Date(year, month - 1, 1), formatLocale)
}

function monthOptions(selected: string | null, monthsBack: number, monthsAhead: number): string[] {
  const now = new Date()
  const keys: string[] = []
  for (let offset = monthsAhead; offset >= -monthsBack; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    keys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  if (selected && !keys.includes(selected)) {
    keys.push(selected)
    keys.sort().reverse()
  }
  return keys
}

export function MonthInput({
  source,
  label,
  validate,
  defaultValue,
  fullWidth,
  monthsBack = DEFAULT_MONTHS_BACK,
  monthsAhead = DEFAULT_MONTHS_AHEAD,
}: {
  source: string
  label?: string
  validate?: Validator | Validator[]
  defaultValue?: string
  fullWidth?: boolean
  monthsBack?: number
  monthsAhead?: number
}) {
  const { field, fieldState, isRequired, id } = useInput({ source, validate, defaultValue })
  const translate = useTranslate()
  const formatLocale = useFormatLocale()
  const selected = monthKey(field.value)

  return (
    <TextField
      id={id}
      select
      label={label ? translate(label, { _: label }) : translate('app.common.month')}
      required={isRequired}
      fullWidth={fullWidth}
      value={selected ?? ''}
      onChange={(event) => field.onChange(event.target.value ? `${event.target.value}-01` : null)}
      onBlur={field.onBlur}
      inputRef={field.ref}
      error={fieldState.invalid}
      helperText={<InputHelperText error={fieldState.invalid ? fieldState.error?.message : undefined} />}
      slotProps={{ select: { MenuProps: { slotProps: { paper: { sx: { maxHeight: 320 } } } } } }}
    >
      {monthOptions(selected, monthsBack, monthsAhead).map((key) => (
        <MenuItem key={key} value={key}>
          {monthLabel(key, formatLocale)}
        </MenuItem>
      ))}
    </TextField>
  )
}
