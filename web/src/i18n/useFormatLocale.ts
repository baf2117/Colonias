import { useLocaleState } from 'react-admin'

// Locale para Intl (fechas, meses, montos) según el idioma elegido en el
// selector de la barra superior: "es-GT" en español, "en-US" en inglés.
export function formatLocaleFor(locale: string): string {
  return locale === 'en' ? 'en-US' : 'es-GT'
}

export function useFormatLocale(): string {
  const [locale] = useLocaleState()
  return formatLocaleFor(locale)
}

// "Septiembre 2026" / "September 2026", con mayúscula inicial (en español
// Intl devuelve el mes en minúscula).
export function formatMonthYear(date: Date, formatLocale: string): string {
  const text = new Intl.DateTimeFormat(formatLocale, { month: 'long', year: 'numeric' }).format(date)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Los 12 meses con mayúscula inicial ("Enero"… / "January"…), para los
// filtros de mes de las listas.
export function monthNames(formatLocale: string): string[] {
  const formatter = new Intl.DateTimeFormat(formatLocale, { month: 'long' })
  return Array.from({ length: 12 }, (_, i) => {
    const text = formatter.format(new Date(2000, i, 1))
    return text.charAt(0).toUpperCase() + text.slice(1)
  })
}

// "septiembre de 2026" / "September 2026": mes y año dentro de una frase
// (en español va en minúscula, en inglés el mes siempre con mayúscula).
export function formatMonthYearInSentence(date: Date, formatLocale: string): string {
  const text = new Intl.DateTimeFormat(formatLocale, { month: 'long', year: 'numeric' }).format(date)
  return formatLocale.startsWith('es') ? text.toLowerCase() : text
}

// "septiembre" / "September": nombre del mes solo, para usar dentro de una
// frase (en español va en minúscula, en inglés siempre con mayúscula).
export function formatMonthName(date: Date, formatLocale: string): string {
  return new Intl.DateTimeFormat(formatLocale, { month: 'long' }).format(date)
}
