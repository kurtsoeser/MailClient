import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './locales/de.json'
import en from './locales/en.json'

export type AppLocale = 'de' | 'en'

const STORAGE_KEY = 'mailclient.locale'

export function readStoredLocale(): AppLocale {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'de') return v
  } catch {
    // ignore
  }
  return 'de'
}

void i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en }
  },
  lng: readStoredLocale(),
  fallbackLng: 'de',
  interpolation: { escapeValue: false },
  react: { useSuspense: false }
})

export { STORAGE_KEY as LOCALE_STORAGE_KEY }
export default i18n
