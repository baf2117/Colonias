import type { TranslationMessages } from 'react-admin'
import polyglotI18nProvider from 'ra-i18n-polyglot'
import englishMessages from 'ra-language-english'
import { appEnglishMessages } from './i18n/app-en'
import { appSpanishMessages } from './i18n/app-es'
import { customEnglishMessages } from './i18n/en'
import { customSpanishMessages } from './i18n/es'
import { raSpanishMessages } from './i18n/ra-es'

// Español es el idioma por defecto (todo el contenido de negocio del
// proyecto se pensó en español); inglés queda disponible desde el menú de
// idiomas que react-admin agrega solo al AppBar cuando hay más de uno.
//
// Tres capas por idioma: los textos "de fábrica" de react-admin (ra.*),
// los nombres de recursos y campos (resources.*, i18n/es.ts y en.ts) y
// los textos propios de las pantallas (app.*, i18n/app-es.ts y
// app-en.ts). Ningún texto visible debería quedar fijo en un componente:
// va con translate('app....').
//
// El español NO usa un paquete de terceros para los textos "de fábrica"
// de react-admin (ra.*) — ver el comentario en ./i18n/ra-es.ts para el
// motivo (conflicto de dependencias con react-admin v5 / React 19).
const translations: Record<string, TranslationMessages> = {
  // ra-es.ts es una traducción propia de ra.* que no declara exactamente
  // el mismo tipo que exporta react-admin (TranslationMessages), de ahí el
  // doble cast; en ejecución Polyglot solo necesita el objeto de claves.
  es: { ...raSpanishMessages, ...customSpanishMessages, ...appSpanishMessages } as unknown as TranslationMessages,
  en: { ...englishMessages, ...customEnglishMessages, ...appEnglishMessages } as TranslationMessages,
}

const getMessages = (locale: string) => translations[locale] ?? translations.es

export const i18nProvider = polyglotI18nProvider(getMessages, 'es', [
  { locale: 'es', name: 'Español' },
  { locale: 'en', name: 'English' },
])

// Idioma elegido en el selector: react-admin lo guarda en localStorage
// ("RaStore.locale", ver localStorageStore de ra-core). Lo usan las
// pantallas que se muestran ANTES de montar <Admin> (cargando, completar
// registro), donde todavía no hay useTranslate.
export function getStoredLocale(): string {
  try {
    const raw = localStorage.getItem('RaStore.locale')
    const value = raw ? JSON.parse(raw) : null
    if (value === 'es' || value === 'en') return value
  } catch {
    // localStorage bloqueado o valor corrupto: se usa el idioma por defecto.
  }
  return 'es'
}

const preAdminProvider = polyglotI18nProvider(getMessages, getStoredLocale())

export function translatePreAdmin(key: string, options?: Record<string, unknown>): string {
  return preAdminProvider.translate(key, options)
}
