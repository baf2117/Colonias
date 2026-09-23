// Mes en curso según la hora local del navegador ("2026-09-01"), para
// usar como defaultValue de <MonthInput>.
export function currentMonthValue(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

// Hoy según la hora local del navegador ("2026-09-22"). No
// toISOString(): eso es UTC, y de noche ya sería mañana.
export function currentDayValue(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
