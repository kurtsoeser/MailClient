import { create } from 'zustand'
import { changeAppLocale, readStoredLocale, type AppLocale, LOCALE_STORAGE_KEY } from '@/i18n'

interface LocaleState {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: readStoredLocale(),
  setLocale(locale): void {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      // ignore
    }
    void changeAppLocale(locale).then(() => {
      set({ locale })
    })
  }
}))
