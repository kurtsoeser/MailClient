import { ipcMain } from 'electron'
import { IPC, type ConnectedAccount } from '@shared/types'
import { normalizeStoredAccountColor } from '@shared/account-colors'
import { loadConfig } from '../config'
import {
  loginMicrosoft,
  listMsalAccounts,
  removeMsalAccount
} from '../auth/microsoft'
import { loginGoogle } from '../auth/google'
import {
  saveGoogleCredentialsForAccount,
  removeGoogleCredentials
} from '../google/google-credentials-store'
import { clearGoogleSyncMetaForAccount } from '../google/google-sync-meta-store'
import { getMe } from '../graph/client'
import { runInitialSync } from '../sync-runner'
import {
  initials,
  listAccounts,
  pickAccountColor,
  removeAccount,
  reorderAccounts,
  upsertAccount
} from '../accounts'
import {
  saveAccountProfilePhoto,
  fetchMicrosoftProfilePhoto,
  deleteAccountProfilePhoto,
  readAccountProfilePhotoDataUrl
} from '../account-photo'
import { broadcastAccountsChanged } from './ipc-broadcasts'
import { parseGoogleIdToken, tryAttachGoogleProfilePhoto } from './ipc-helpers'
import { deletePeopleDataForAccount } from '../db/people-repo'

export function registerAuthIpc(): void {
  ipcMain.handle(IPC.auth.listAccounts, async (): Promise<ConnectedAccount[]> => {
    return listAccounts()
  })

  ipcMain.handle(IPC.auth.getProfilePhotoDataUrl, async (_event, accountId: string): Promise<string | null> => {
    const accounts = await listAccounts()
    const acc = accounts.find((a) => a.id === accountId)
    if (!acc?.profilePhotoFile) return null
    return readAccountProfilePhotoDataUrl(acc.id, acc.profilePhotoFile)
  })

  ipcMain.handle(IPC.auth.addMicrosoft, async (): Promise<ConnectedAccount> => {
    const config = await loadConfig()
    if (!config.microsoftClientId) {
      throw new Error('Keine Azure Client-ID konfiguriert. Bitte in den Einstellungen eintragen.')
    }

    const tokenResult = await loginMicrosoft(config.microsoftClientId)
    if (!tokenResult.account) {
      throw new Error('Anmeldung fehlgeschlagen: kein MSAL-Account zurueckgegeben.')
    }

    const profile = await getMe(config.microsoftClientId, tokenResult.account.homeAccountId)
    const existing = await listAccounts()
    const email = profile.mail ?? profile.userPrincipalName

    let account: ConnectedAccount = {
      id: `ms:${tokenResult.account.homeAccountId}`,
      provider: 'microsoft',
      email,
      displayName: profile.displayName || email,
      tenantId: tokenResult.account.tenantId,
      color: pickAccountColor(existing),
      initials: initials(profile.displayName, email),
      addedAt: new Date().toISOString()
    }

    try {
      const buf = await fetchMicrosoftProfilePhoto(
        config.microsoftClientId,
        tokenResult.account.homeAccountId
      )
      if (buf) {
        const fileName = await saveAccountProfilePhoto(account.id, buf)
        account = { ...account, profilePhotoFile: fileName }
      }
    } catch (e) {
      console.warn('[ipc] Microsoft-Profilfoto:', e)
    }

    const next = await upsertAccount(account)
    broadcastAccountsChanged(next)

    void runInitialSync(account.id)
    return account
  })

  ipcMain.handle(IPC.auth.addGoogle, async (): Promise<ConnectedAccount> => {
    const config = await loadConfig()
    if (!config.googleClientId?.trim()) {
      throw new Error('Keine Google Client-ID konfiguriert. Bitte in den Einstellungen eintragen.')
    }
    const gSecret = config.googleClientSecret?.trim()

    const { tokens } = await loginGoogle(config.googleClientId.trim(), {
      clientSecret: gSecret && gSecret.length > 0 ? gSecret : undefined
    })
    if (!tokens.refresh_token) {
      throw new Error(
        'Google hat keinen Refresh-Token zurueckgegeben. Bitte erneut anmelden und die Kontozugriffe bestaetigen (offline access).'
      )
    }
    const idt = tokens.id_token
    if (!idt) {
      throw new Error('Google hat kein id_token zurueckgegeben.')
    }
    const { sub, email, name } = parseGoogleIdToken(idt)
    const accountId = `google:${sub}`
    await saveGoogleCredentialsForAccount(accountId, {
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token ?? null,
      expiry_date: tokens.expiry_date ?? null,
      scope: tokens.scope ?? null,
      token_type: tokens.token_type ?? null,
      id_token: idt
    })

    const existing = await listAccounts()
    const emailFinal = email ?? 'google@unknown'
    let account: ConnectedAccount = {
      id: accountId,
      provider: 'google',
      email: emailFinal,
      displayName: (name && name.length > 0 ? name : emailFinal) || emailFinal,
      color: pickAccountColor(existing),
      initials: initials(name ?? '', emailFinal),
      addedAt: new Date().toISOString()
    }

    account = await tryAttachGoogleProfilePhoto(
      accountId,
      idt,
      account,
      tokens.access_token ?? null
    )

    const next = await upsertAccount(account)
    broadcastAccountsChanged(next)

    void runInitialSync(account.id)
    return account
  })

  ipcMain.handle(IPC.auth.refreshGoogle, async (_event, accountId: unknown): Promise<ConnectedAccount> => {
    const id = typeof accountId === 'string' ? accountId.trim() : ''
    if (!id) {
      throw new Error('Keine Konto-ID.')
    }
    const config = await loadConfig()
    if (!config.googleClientId?.trim()) {
      throw new Error('Keine Google Client-ID konfiguriert. Bitte in den Einstellungen eintragen.')
    }
    const gSecret = config.googleClientSecret?.trim()

    const existingAccounts = await listAccounts()
    const prev = existingAccounts.find((a) => a.id === id)
    if (!prev) {
      throw new Error('Konto nicht gefunden.')
    }
    if (prev.provider !== 'google') {
      throw new Error('Nur Google-Konten koennen hier erneut angemeldet werden.')
    }

    const expectedSub = id.replace(/^google:/, '')
    const { tokens } = await loginGoogle(config.googleClientId.trim(), {
      loginHint: prev.email,
      prompt: 'consent',
      clientSecret: gSecret && gSecret.length > 0 ? gSecret : undefined
    })
    if (!tokens.refresh_token) {
      throw new Error('Google hat keinen Refresh-Token zurueckgegeben.')
    }
    const idt = tokens.id_token
    if (!idt) {
      throw new Error('Google hat kein id_token zurueckgegeben.')
    }
    const { sub, email, name } = parseGoogleIdToken(idt)
    if (sub !== expectedSub) {
      throw new Error(
        'Es wurde ein anderes Google-Konto angemeldet. Bitte dasselbe Konto wie in der App waehlen oder abbrechen.'
      )
    }

    await saveGoogleCredentialsForAccount(id, {
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token ?? null,
      expiry_date: tokens.expiry_date ?? null,
      scope: tokens.scope ?? null,
      token_type: tokens.token_type ?? null,
      id_token: idt
    })

    const emailFinal = email ?? prev.email
    let account: ConnectedAccount = {
      ...prev,
      email: emailFinal,
      displayName: (name && name.length > 0 ? name : emailFinal) || emailFinal,
      initials: initials(name ?? '', emailFinal)
    }

    account = await tryAttachGoogleProfilePhoto(id, idt, account, tokens.access_token ?? null)

    const next = await upsertAccount(account)
    broadcastAccountsChanged(next)

    void runInitialSync(account.id)
    return account
  })

  ipcMain.handle(IPC.auth.refreshMicrosoft, async (_event, accountId: unknown): Promise<ConnectedAccount> => {
    const id = typeof accountId === 'string' ? accountId.trim() : ''
    if (!id) {
      throw new Error('Keine Konto-ID.')
    }
    const config = await loadConfig()
    if (!config.microsoftClientId) {
      throw new Error('Keine Azure Client-ID konfiguriert. Bitte in den Einstellungen eintragen.')
    }

    const existingAccounts = await listAccounts()
    const prev = existingAccounts.find((a) => a.id === id)
    if (!prev) {
      throw new Error('Konto nicht gefunden.')
    }
    if (prev.provider !== 'microsoft') {
      throw new Error('Nur Microsoft-Konten koennen erneut angemeldet werden.')
    }

    const expectedHomeId = id.replace(/^ms:/, '')
    const tokenResult = await loginMicrosoft(config.microsoftClientId, {
      loginHint: prev.email,
      prompt: 'consent'
    })
    if (!tokenResult.account) {
      throw new Error('Anmeldung fehlgeschlagen: kein MSAL-Account zurueckgegeben.')
    }
    if (tokenResult.account.homeAccountId !== expectedHomeId) {
      throw new Error(
        'Es wurde ein anderes Microsoft-Konto angemeldet. Bitte dasselbe Konto wie in der App waehlen oder abbrechen.'
      )
    }

    const profile = await getMe(config.microsoftClientId, tokenResult.account.homeAccountId)
    const email = profile.mail ?? profile.userPrincipalName

    let account: ConnectedAccount = {
      id,
      provider: 'microsoft',
      email,
      displayName: profile.displayName || email,
      tenantId: tokenResult.account.tenantId,
      color: prev.color,
      initials: initials(profile.displayName, email),
      addedAt: prev.addedAt,
      profilePhotoFile: prev.profilePhotoFile
    }

    try {
      const buf = await fetchMicrosoftProfilePhoto(
        config.microsoftClientId,
        tokenResult.account.homeAccountId
      )
      if (buf) {
        const fileName = await saveAccountProfilePhoto(account.id, buf)
        account = { ...account, profilePhotoFile: fileName }
      }
    } catch (e) {
      console.warn('[ipc] Microsoft-Profilfoto (Refresh):', e)
    }

    const next = await upsertAccount(account)
    broadcastAccountsChanged(next)

    void runInitialSync(account.id)
    return account
  })

  ipcMain.handle(IPC.auth.remove, async (_event, id: string): Promise<ConnectedAccount[]> => {
    const current = await listAccounts()
    const target = current.find((a) => a.id === id)
    if (!target) return current

    if (target.provider === 'microsoft') {
      const config = await loadConfig()
      if (config.microsoftClientId) {
        const homeAccountId = id.replace(/^ms:/, '')
        try {
          await removeMsalAccount(config.microsoftClientId, homeAccountId)
        } catch (e) {
          console.warn('[ipc] MSAL-Account konnte nicht entfernt werden:', e)
        }
      }
    } else if (target.provider === 'google') {
      try {
        await removeGoogleCredentials(id)
        await clearGoogleSyncMetaForAccount(id)
      } catch (e) {
        console.warn('[ipc] Google-Credentials konnten nicht entfernt werden:', e)
      }
    }

    await deleteAccountProfilePhoto(target.profilePhotoFile, target.id)

    try {
      deletePeopleDataForAccount(id)
    } catch (e) {
      console.warn('[ipc] Kontakte-Cache konnte nicht geloescht werden:', e)
    }

    const next = await removeAccount(id)
    broadcastAccountsChanged(next)
    return next
  })

  ipcMain.handle(IPC.auth.reorderAccounts, async (_event, accountIds: string[]): Promise<ConnectedAccount[]> => {
    if (!Array.isArray(accountIds)) {
      throw new Error('Ungueltige Argumente fuer Konten-Reihenfolge.')
    }
    const next = await reorderAccounts(accountIds)
    broadcastAccountsChanged(next)
    return next
  })

  ipcMain.handle(
    IPC.auth.patchAccount,
    async (_event, payload: unknown): Promise<ConnectedAccount> => {
      const body = payload as {
        accountId?: string
        color?: string
        calendarLoadAheadDays?: number | null | 'default'
      }
      const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : ''
      if (!accountId) {
        throw new Error('Keine Konto-ID.')
      }
      const hasColor = typeof body.color === 'string' && body.color.trim().length > 0
      const hasAhead = 'calendarLoadAheadDays' in body
      if (!hasColor && !hasAhead) {
        throw new Error('Keine Aenderungen (Farbe oder Kalender-Vorausschau).')
      }
      const current = await listAccounts()
      const prev = current.find((a) => a.id === accountId)
      if (!prev) {
        throw new Error('Konto nicht gefunden.')
      }
      const account: ConnectedAccount = { ...prev }
      if (hasColor) {
        const colorRaw = body.color!.trim()
        const normalized = normalizeStoredAccountColor(colorRaw)
        if (!normalized) {
          throw new Error('Ungueltige Kontofarbe (Preset oder #rrggbb).')
        }
        account.color = normalized
      }
      if (hasAhead) {
        const raw = body.calendarLoadAheadDays
        if (raw === 'default') {
          delete account.calendarLoadAheadDays
        } else if (raw === null) {
          account.calendarLoadAheadDays = null
        } else if (typeof raw === 'number' && Number.isFinite(raw)) {
          if (raw < 7 || raw > 3650) {
            throw new Error('Kalender-Vorausschau: 7 bis 3650 Tage, oder «Keine Begrenzung».')
          }
          account.calendarLoadAheadDays = raw
        } else {
          throw new Error('Ungueltige Kalender-Vorausschau.')
        }
      }
      await upsertAccount(account)
      const next = await listAccounts()
      broadcastAccountsChanged(next)
      return account
    }
  )
}
