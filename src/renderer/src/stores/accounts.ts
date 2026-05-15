import { create } from 'zustand'
import type { AppConfig, AppConfigWeatherLocation, ConnectedAccount, PatchAccountInput } from '@shared/types'
import { safeSetCalendarTimeZone, safeSetGoogleClientId, safeSetWeatherLocation } from '@/lib/config-invoke'

async function loadProfilePhotoDataUrls(accounts: ConnectedAccount[]): Promise<Record<string, string>> {
  const withPhoto = accounts.filter((a) => a.profilePhotoFile)
  const pairs = await Promise.all(
    withPhoto.map(async (a) => {
      try {
        const url = await window.mailClient.auth.getProfilePhotoDataUrl(a.id)
        return url ? ([a.id, url] as const) : null
      } catch {
        return null
      }
    })
  )
  return Object.fromEntries(pairs.filter((p): p is [string, string] => p !== null))
}

interface AccountsState {
  accounts: ConnectedAccount[]
  /** Data-URLs der Microsoft-Profilfotos, keyed by account id */
  profilePhotoDataUrls: Record<string, string>
  config: AppConfig | null
  loading: boolean
  error: string | null

  initialize: () => Promise<void>
  setMicrosoftClientId: (clientId: string) => Promise<void>
  setGoogleClientId: (clientId: string, clientSecret?: string | null) => Promise<void>
  setNotionCredentials: (clientId: string, clientSecret?: string | null) => Promise<void>
  setSyncWindowDays: (days: number | null) => Promise<void>
  setAutoLoadImages: (value: boolean) => Promise<void>
  setCalendarTimeZone: (iana: string | null) => Promise<void>
  setWeatherLocation: (loc: AppConfigWeatherLocation | null) => Promise<void>
  addMicrosoftAccount: () => Promise<void>
  addGoogleAccount: () => Promise<void>
  refreshMicrosoftAccount: (id: string) => Promise<void>
  refreshGoogleAccount: (id: string) => Promise<void>
  removeAccount: (id: string) => Promise<void>
  patchAccountColor: (accountId: string, color: string) => Promise<void>
  patchAccountCalendarLoadAhead: (
    accountId: string,
    value: number | null | 'default'
  ) => Promise<void>
  patchAccountSignatures: (
    accountId: string,
    patch: Pick<PatchAccountInput, 'signatureTemplates' | 'defaultSignatureTemplateId'>
  ) => Promise<void>
  dismissWorkflowMailFoldersIntro: () => Promise<void>
  setFirstRunSetupCompleted: (value: boolean) => Promise<void>
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  accounts: [],
  profilePhotoDataUrls: {},
  config: null,
  loading: false,
  error: null,

  async initialize(): Promise<void> {
    set({ loading: true, error: null })
    try {
      const [accounts, config] = await Promise.all([
        window.mailClient.auth.listAccounts(),
        window.mailClient.config.get()
      ])
      let profilePhotoDataUrls: Record<string, string> = {}
      try {
        profilePhotoDataUrls = await loadProfilePhotoDataUrls(accounts)
      } catch (e) {
        console.warn('[accounts] Profilfotos konnten nicht geladen werden:', e)
      }
      set({ accounts, config, profilePhotoDataUrls, loading: false })

      window.mailClient.events.onAccountsChanged((next) => {
        void (async (): Promise<void> => {
          const urls = await loadProfilePhotoDataUrls(next)
          set({ accounts: next, profilePhotoDataUrls: urls })
        })()
      })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  async setGoogleClientId(clientId: string, clientSecret?: string | null): Promise<void> {
    set({ error: null })
    try {
      const config = await safeSetGoogleClientId(clientId, clientSecret)
      set({ config })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async setNotionCredentials(clientId: string, clientSecret?: string | null): Promise<void> {
    set({ error: null })
    try {
      const config = await window.mailClient.config.setNotionCredentials(clientId, clientSecret)
      set({ config })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async addGoogleAccount(): Promise<void> {
    set({ loading: true, error: null })
    try {
      const account = await window.mailClient.auth.addGoogle()
      const existing = get().accounts.filter((a) => a.id !== account.id)
      const nextAccounts = [...existing, account]
      const profilePhotoDataUrls = await loadProfilePhotoDataUrls(nextAccounts)
      set({ accounts: nextAccounts, profilePhotoDataUrls, loading: false })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async refreshGoogleAccount(id: string): Promise<void> {
    set({ error: null })
    try {
      await window.mailClient.auth.refreshGoogle(id)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async setMicrosoftClientId(clientId: string): Promise<void> {
    set({ error: null })
    try {
      const config = await window.mailClient.config.setMicrosoftClientId(clientId)
      set({ config })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async setSyncWindowDays(days: number | null): Promise<void> {
    set({ error: null })
    try {
      const config = await window.mailClient.config.setSyncWindowDays(days)
      set({ config })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async setAutoLoadImages(value: boolean): Promise<void> {
    set({ error: null })
    try {
      const config = await window.mailClient.config.setAutoLoadImages(value)
      set({ config })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async setCalendarTimeZone(iana: string | null): Promise<void> {
    set({ error: null })
    try {
      const config = await safeSetCalendarTimeZone(iana)
      set({ config })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async setWeatherLocation(loc: AppConfigWeatherLocation | null): Promise<void> {
    set({ error: null })
    try {
      const config = await safeSetWeatherLocation(loc)
      set({ config })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async addMicrosoftAccount(): Promise<void> {
    set({ loading: true, error: null })
    try {
      const account = await window.mailClient.auth.addMicrosoft()
      const existing = get().accounts.filter((a) => a.id !== account.id)
      const nextAccounts = [...existing, account]
      const profilePhotoDataUrls = await loadProfilePhotoDataUrls(nextAccounts)
      set({ accounts: nextAccounts, profilePhotoDataUrls, loading: false })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async refreshMicrosoftAccount(id: string): Promise<void> {
    set({ error: null })
    try {
      await window.mailClient.auth.refreshMicrosoft(id)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async removeAccount(id: string): Promise<void> {
    set({ error: null })
    try {
      const next = await window.mailClient.auth.remove(id)
      const profilePhotoDataUrls = await loadProfilePhotoDataUrls(next)
      set({ accounts: next, profilePhotoDataUrls })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async patchAccountColor(accountId: string, color: string): Promise<void> {
    set({ error: null })
    try {
      await window.mailClient.auth.patchAccount({ accountId, color })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async patchAccountCalendarLoadAhead(
    accountId: string,
    value: number | null | 'default'
  ): Promise<void> {
    set({ error: null })
    try {
      await window.mailClient.auth.patchAccount({ accountId, calendarLoadAheadDays: value })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async patchAccountSignatures(
    accountId: string,
    patch: Pick<PatchAccountInput, 'signatureTemplates' | 'defaultSignatureTemplateId'>
  ): Promise<void> {
    set({ error: null })
    try {
      await window.mailClient.auth.patchAccount({ accountId, ...patch })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async dismissWorkflowMailFoldersIntro(): Promise<void> {
    set({ error: null })
    try {
      const config = await window.mailClient.config.setWorkflowMailFoldersIntroDismissed(true)
      set({ config })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async setFirstRunSetupCompleted(value: boolean): Promise<void> {
    set({ error: null })
    try {
      const config = await window.mailClient.config.setFirstRunSetupCompleted(value)
      set({ config })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  }
}))
