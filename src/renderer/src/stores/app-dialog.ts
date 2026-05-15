import { create } from 'zustand'

export type AppDialogVariant = 'default' | 'danger'

export type AppDialogKind = 'alert' | 'confirm' | 'prompt' | 'choice'

export type AppDialogChoiceVariant = 'default' | 'primary' | 'secondary'

export interface AppDialogChoiceAction {
  id: string
  label: string
  variant?: AppDialogChoiceVariant
}

export interface AppDialogOpenState {
  open: boolean
  kind: AppDialogKind | null
  title: string | null
  message: string
  variant: AppDialogVariant
  confirmLabel: string
  cancelLabel: string
  okLabel: string
  defaultValue: string
  placeholder: string
  inputValue: string
  choiceActions: AppDialogChoiceAction[]
}

interface AppDialogStore extends AppDialogOpenState {
  _finish:
    | (() => void)
    | ((b: boolean) => void)
    | ((s: string | null) => void)
    | ((id: string | null) => void)
    | null
  setInputValue: (v: string) => void
  _resolveAndClose: (value?: boolean | string | null | void) => void
}

const initial: AppDialogOpenState & {
  _finish:
    | (() => void)
    | ((b: boolean) => void)
    | ((s: string | null) => void)
    | ((id: string | null) => void)
    | null
  choiceActions: AppDialogChoiceAction[]
} = {
  open: false,
  kind: null,
  title: null,
  message: '',
  variant: 'default',
  confirmLabel: 'OK',
  cancelLabel: 'Abbrechen',
  okLabel: 'OK',
  defaultValue: '',
  placeholder: '',
  inputValue: '',
  choiceActions: [],
  _finish: null
}

export const useAppDialogStore = create<AppDialogStore>((set, get) => ({
  ...initial,

  setInputValue(v: string): void {
    set({ inputValue: v })
  },

  _resolveAndClose(value?: boolean | string | null | void): void {
    const s = get()
    const fn = s._finish
    const k = s.kind
    const iv = s.inputValue
    set({ ...initial })
    if (!fn || !k) return
    if (k === 'alert') {
      ;(fn as () => void)()
      return
    }
    if (k === 'confirm') {
      ;(fn as (ok: boolean) => void)(value === true)
      return
    }
    if (k === 'choice') {
      ;(fn as (id: string | null) => void)(
        typeof value === 'string' && value.length > 0 ? value : null
      )
      return
    }
    const out =
      value === null || value === false
        ? null
        : typeof value === 'string'
          ? value
          : iv
    ;(fn as (r: string | null) => void)(out)
  }
}))

export function showAppAlert(
  message: string,
  opts?: { title?: string; okLabel?: string }
): Promise<void> {
  return new Promise((resolve) => {
    useAppDialogStore.setState({
      ...initial,
      open: true,
      kind: 'alert',
      title: opts?.title?.trim() ? opts.title.trim() : null,
      message,
      variant: 'default',
      okLabel: opts?.okLabel?.trim() || 'OK',
      _finish: (): void => {
        resolve()
      }
    })
  })
}

export function showAppConfirm(
  message: string,
  opts?: {
    title?: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: AppDialogVariant
  }
): Promise<boolean> {
  return new Promise((resolve) => {
    const variant = opts?.variant ?? 'default'
    useAppDialogStore.setState({
      ...initial,
      open: true,
      kind: 'confirm',
      title: opts?.title?.trim() ? opts.title.trim() : null,
      message,
      variant,
      confirmLabel:
        opts?.confirmLabel?.trim() || (variant === 'danger' ? 'Loeschen' : 'OK'),
      cancelLabel: opts?.cancelLabel?.trim() || 'Abbrechen',
      _finish: (ok: boolean): void => {
        resolve(ok)
      }
    })
  })
}

export function showAppChoice(
  message: string,
  opts: {
    title?: string
    cancelLabel?: string
    actions: AppDialogChoiceAction[]
  }
): Promise<string | null> {
  const actions = opts.actions.filter((a) => a.id.trim() && a.label.trim())
  return new Promise((resolve) => {
    useAppDialogStore.setState({
      ...initial,
      open: true,
      kind: 'choice',
      title: opts?.title?.trim() ? opts.title.trim() : null,
      message,
      variant: 'default',
      cancelLabel: opts.cancelLabel?.trim() || 'Schließen',
      choiceActions: actions,
      _finish: (id: string | null): void => {
        resolve(id)
      }
    })
  })
}

export function showAppPrompt(
  message: string,
  opts?: {
    title?: string
    defaultValue?: string
    placeholder?: string
    confirmLabel?: string
    cancelLabel?: string
  }
): Promise<string | null> {
  const def = opts?.defaultValue ?? ''
  return new Promise((resolve) => {
    useAppDialogStore.setState({
      ...initial,
      open: true,
      kind: 'prompt',
      title: opts?.title?.trim() ? opts.title.trim() : null,
      message,
      variant: 'default',
      defaultValue: def,
      inputValue: def,
      placeholder: opts?.placeholder?.trim() ?? '',
      confirmLabel: opts?.confirmLabel?.trim() || 'OK',
      cancelLabel: opts?.cancelLabel?.trim() || 'Abbrechen',
      _finish: (r: string | null): void => {
        resolve(r)
      }
    })
  })
}
