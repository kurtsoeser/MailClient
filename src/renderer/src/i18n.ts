import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export type AppLocale = 'de' | 'en'

const STORAGE_KEY = 'mailclient.locale'

const localeLoaders: Record<AppLocale, () => Promise<{ default: Record<string, unknown> }>> = {
  de: () => import('./locales/de.json'),
  en: () => import('./locales/en.json')
}

/** Geladene Bundles (hasResourceBundle ist vor init() nicht zuverlaessig). */
const loadedLocales = new Set<AppLocale>()

export function readStoredLocale(): AppLocale {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'de') return v
  } catch {
    // ignore
  }
  return 'de'
}

export async function loadLocaleBundle(locale: AppLocale): Promise<void> {
  if (loadedLocales.has(locale)) return
  const mod = await localeLoaders[locale]()
  if (i18n.isInitialized) {
    i18n.addResourceBundle(locale, 'translation', mod.default, true, true)
  }
  loadedLocales.add(locale)
}

let initPromise: Promise<void> | null = null

/** Aktive Sprache laden und i18next initialisieren (nur ein Bundle im Start-Pfad). */
export function initI18n(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const lng = readStoredLocale()
    const mod = await localeLoaders[lng]()
    loadedLocales.add(lng)
    await i18n.use(initReactI18next).init({
      resources: {
        [lng]: { translation: mod.default }
      },
      lng,
      fallbackLng: 'de',
      partialBundledLanguages: true,
      interpolation: { escapeValue: false },
      react: { useSuspense: false }
    })
  })()
  return initPromise
}

/** Sprache wechseln (laedt Bundle bei Bedarf; Fallback `de` wird mitgeladen). */
export async function changeAppLocale(locale: AppLocale): Promise<void> {
  if (!loadedLocales.has(locale)) {
    const mod = await localeLoaders[locale]()
    i18n.addResourceBundle(locale, 'translation', mod.default, true, true)
    loadedLocales.add(locale)
  }
  if (locale !== 'de' && !loadedLocales.has('de')) {
    const mod = await localeLoaders.de()
    i18n.addResourceBundle('de', 'translation', mod.default, true, true)
    loadedLocales.add('de')
  }
  await i18n.changeLanguage(locale)
}

export { STORAGE_KEY as LOCALE_STORAGE_KEY }
export default i18n
