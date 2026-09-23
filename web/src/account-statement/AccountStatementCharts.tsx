import { Box, Stack, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useTranslate } from 'react-admin'
import { useFormatLocale } from '../i18n/useFormatLocale'

export type TrendPoint = { period: string; income: number; expenses: number; bankBalance: number | null }
export type CategoryAmount = { category: string; amount: number }


// "Techo" redondo para el eje: 1, 2 o 5 × 10^k, para que las marcas caigan
// en números legibles en vez de 13.847.
function niceMax(value: number): number {
  if (value <= 0) return 1
  const exponent = Math.floor(Math.log10(value))
  const base = 10 ** exponent
  const fraction = value / base
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * base
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
      {items.map((item) => (
        <Stack key={item.label} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 10, height: 10, bgcolor: item.color }} />
          <Typography variant="caption" color="text.secondary">
            {item.label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  )
}

// Barras agrupadas ingresos/egresos por mes (los últimos 6 hasta el mes
// elegido). El último grupo es el mes elegido y va resaltado.
export function TrendChart({ points, formatMoney }: { points: TrendPoint[]; formatMoney: (value: number) => string }) {
  const theme = useTheme()
  const translate = useTranslate()
  const formatLocale = useFormatLocale()
  const compact = new Intl.NumberFormat(formatLocale, { notation: 'compact', maximumFractionDigits: 1 })
  const monthShort = new Intl.DateTimeFormat(formatLocale, { month: 'short' })
  const incomeLabel = translate('app.accountStatement.income')
  const expensesLabel = translate('app.accountStatement.expenses')
  const incomeColor = theme.palette.success.main
  const expenseColor = theme.palette.primary.main
  const textColor = theme.palette.text.secondary
  const gridColor = theme.palette.divider

  const width = 640
  const height = 260
  const margin = { top: 12, right: 8, bottom: 36, left: 56 }
  const plotW = width - margin.left - margin.right
  const plotH = height - margin.top - margin.bottom

  const maxValue = niceMax(Math.max(0, ...points.flatMap((p) => [p.income, p.expenses])))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxValue)
  const y = (value: number) => margin.top + plotH - (value / maxValue) * plotH

  const groupW = plotW / Math.max(points.length, 1)
  const barW = Math.min(28, groupW * 0.3)

  return (
    <Stack spacing={1.5}>
      <Legend
        items={[
          { label: incomeLabel, color: incomeColor },
          { label: expensesLabel, color: expenseColor },
        ]}
      />
      <Box sx={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ minWidth: 420, display: 'block' }} role="img" aria-label={translate('app.accountStatement.trendAria')}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke={gridColor} strokeWidth={tick === 0 ? 2 : 1} strokeDasharray={tick === 0 ? undefined : '3 4'} />
              <text x={margin.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={13} fill={textColor}>
                {compact.format(tick)}
              </text>
            </g>
          ))}
          {points.map((point, index) => {
            const cx = margin.left + groupW * index + groupW / 2
            const isSelected = index === points.length - 1
            const date = new Date(point.period)
            const label = `${monthShort.format(date).replace('.', '')} ${String(date.getFullYear()).slice(2)}`
            return (
              <g key={point.period}>
                {isSelected ? (
                  <rect x={cx - groupW / 2 + 2} y={margin.top} width={groupW - 4} height={plotH} fill={theme.palette.action.hover} />
                ) : null}
                <rect x={cx - barW - 2} y={y(point.income)} width={barW} height={Math.max(0, y(0) - y(point.income))} fill={incomeColor}>
                  <title>{`${incomeLabel}: ${formatMoney(point.income)}`}</title>
                </rect>
                <rect x={cx + 2} y={y(point.expenses)} width={barW} height={Math.max(0, y(0) - y(point.expenses))} fill={expenseColor}>
                  <title>{`${expensesLabel}: ${formatMoney(point.expenses)}`}</title>
                </rect>
                <text x={cx} y={height - 14} textAnchor="middle" fontSize={13} fontWeight={isSelected ? 700 : 400} fill={isSelected ? theme.palette.text.primary : textColor}>
                  {label}
                </text>
              </g>
            )
          })}
        </svg>
      </Box>
    </Stack>
  )
}

// Egresos del mes por categoría, en barras horizontales proporcionales al
// mayor. La nómina pagada entra como una categoría más.
export function ExpenseBreakdown({ items, formatMoney }: { items: CategoryAmount[]; formatMoney: (value: number) => string }) {
  const theme = useTheme()
  const translate = useTranslate()
  const max = Math.max(0, ...items.map((item) => item.amount))

  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {translate('app.accountStatement.noExpenses')}
      </Typography>
    )
  }

  return (
    <Stack spacing={1.5}>
      {items.map((item) => (
        <Box key={item.category}>
          <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.category}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {formatMoney(item.amount)}
            </Typography>
          </Stack>
          <Box sx={{ mt: 0.5, height: 8, bgcolor: 'action.hover' }}>
            <Box sx={{ height: '100%', width: `${max > 0 ? (item.amount / max) * 100 : 0}%`, bgcolor: theme.palette.primary.main }} />
          </Box>
        </Box>
      ))}
    </Stack>
  )
}
