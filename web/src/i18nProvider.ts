import polyglotI18nProvider from 'ra-i18n-polyglot'
import englishMessages from 'ra-language-english'
import { customEnglishMessages } from './i18n/en'
import { customSpanishMessages } from './i18n/es'
import { raSpanishMessages } from './i18n/ra-es'

// Español es el idioma por defecto (todo el contenido de negocio del
// proyecto se pensó en español); inglés queda disponible desde el menú de
// idiomas que react-admin agrega solo al AppBar cuando hay más de uno.
//
// El español NO usa un paquete de terceros para los textos "de fábrica"
// de react-admin (ra.*) — ver el comentario en ./i18n/ra-es.ts para el
// motivo (conflicto de dependencias con react-admin v5 / React 19).
const translations: Record<string, object> = {
  es: { ...raSpanishMessages, ...customSpanishMessages },
  en: { ...englishMessages, ...customEnglishMessages },
}

export const i18nProvider = polyglotI18nProvider(
  (locale) => translations[locale] ?? translations.es,
  'es',
  [
    { locale: 'es', name: 'Español' },
    { locale: 'en', name: 'English' },
  ],
)
