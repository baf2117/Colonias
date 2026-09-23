// Lista completa de monedas del mundo, sin depender de ningún paquete
// externo (npm) ni de una fuente que haya que mantener a mano.
//
// Intl.supportedValuesOf('currency') es una API estándar del propio
// motor de JavaScript (ECMA-402), disponible en todos los navegadores
// modernos desde 2022: devuelve los ~300 códigos ISO 4217 que el motor
// conoce, incluyendo monedas históricas (además de MXN, USD, EUR, etc.
// trae cosas como el viejo Marco alemán). No es una selección curada a
// mano — es literalmente "todas las monedas que existen", que es lo que
// se pidió.
//
// Intl.DisplayNames da el nombre de cada código en el idioma de la app
// ("es" / "en", el del selector de idioma), así el selector no obliga a
// memorizar códigos: "Peso mexicano (MXN)" / "Mexican Peso (MXN)" en vez
// de solo "MXN".
export type CurrencyChoice = { id: string; name: string }

const cache = new Map<string, CurrencyChoice[]>()

export function getCurrencyChoices(locale: string): CurrencyChoice[] {
  const cached = cache.get(locale)
  if (cached) return cached

  const codes =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : ['MXN', 'USD']

  const displayNames = new Intl.DisplayNames([locale], { type: 'currency' })

  const choices = codes
    .map((code) => {
      const name = displayNames.of(code) ?? code
      return { id: code, name: `${name} (${code})` }
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale))

  cache.set(locale, choices)
  return choices
}
