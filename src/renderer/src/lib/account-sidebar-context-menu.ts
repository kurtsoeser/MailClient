import type { ComponentType } from 'react'
import { Palette } from 'lucide-react'
import type { ConnectedAccount } from '@shared/types'
import type { ContextMenuItem } from '@/components/ContextMenu'
import { accountColorToCssBackground } from '@/lib/avatar-color'
import { ACCOUNT_COLOR_PRESET_OPTIONS, isPresetAccountColorClass } from '@shared/account-colors'

export function openNativeAccountColorPicker(options: {
  accountId: string
  currentStored: string
  patchAccountColor: (accountId: string, color: string) => Promise<void>
  onError?: (message: string) => void
}): void {
  const { accountId, currentStored, patchAccountColor, onError } = options
  const el = document.createElement('input')
  el.type = 'color'
  el.value = accountColorToCssBackground(currentStored) ?? '#64748b'
  el.setAttribute('aria-hidden', 'true')
  Object.assign(el.style, {
    position: 'fixed',
    opacity: '0',
    width: '1px',
    height: '1px',
    left: '0',
    top: '0',
    pointerEvents: 'none'
  })
  document.body.appendChild(el)
  const cleanup = (): void => {
    el.remove()
  }
  el.addEventListener('change', () => {
    void patchAccountColor(accountId, el.value).catch((e) => {
      onError?.(e instanceof Error ? e.message : String(e))
    })
    cleanup()
  })
  window.setTimeout(() => {
    el.click()
  }, 0)
}

/**
 * Rechtsklick-Menue auf Konto-Zeilen (nicht E-Mail-Ordner): Kontofarbe + kontextspezifische «Neu»-Aktion.
 */
export function buildAccountColorAndNewContextItems(options: {
  account: ConnectedAccount
  patchAccountColor: (accountId: string, color: string) => Promise<void>
  onPatchError?: (message: string) => void
  newItem: {
    id: string
    label: string
    icon: ComponentType<{ className?: string }>
    onSelect: () => void
  }
}): ContextMenuItem[] {
  const { account, patchAccountColor, onPatchError, newItem } = options
  const accountId = account.id
  const colorSubmenu: ContextMenuItem[] = [
    ...ACCOUNT_COLOR_PRESET_OPTIONS.map((o) => ({
      id: `acc-color-${accountId}-${o.value}`,
      label: o.label,
      swatchHex: accountColorToCssBackground(o.value),
      selected: account.color === o.value,
      onSelect: (): void => {
        void patchAccountColor(accountId, o.value).catch((e) => {
          onPatchError?.(e instanceof Error ? e.message : String(e))
        })
      }
    })),
    {
      id: `acc-color-custom-${accountId}`,
      label: 'Eigene Farbe…',
      swatchHex: accountColorToCssBackground(account.color) ?? '#64748b',
      selected: !isPresetAccountColorClass(account.color),
      onSelect: (): void => {
        const cur = account.color
        window.setTimeout(
          () =>
            openNativeAccountColorPicker({
              accountId,
              currentStored: cur,
              patchAccountColor,
              onError: onPatchError
            }),
          0
        )
      }
    }
  ]
  return [
    {
      id: `acc-color-menu-${accountId}`,
      label: 'Kontofarbe',
      icon: Palette,
      submenu: colorSubmenu
    },
    { id: `acc-sep-new-${accountId}`, label: '', separator: true },
    {
      id: newItem.id,
      label: newItem.label,
      icon: newItem.icon,
      onSelect: newItem.onSelect
    }
  ]
}
