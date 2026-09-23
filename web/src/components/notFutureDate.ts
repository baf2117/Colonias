import { currentDayValue } from './monthValue'

// Validador de react-admin: la fecha (YYYY-MM-DD) no puede ser posterior a
// hoy (hora local). Espejo de ValidatePaymentDate en api/Payments.cs.
// `message` es una clave de traducción: react-admin traduce lo que
// devuelve un validador.
export function notFutureDate(message = 'app.common.futureDate') {
  return (value: unknown) => (typeof value === 'string' && value.slice(0, 10) > currentDayValue() ? message : undefined)
}
