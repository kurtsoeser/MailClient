import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const DESK_NOTE_STORAGE_KEY = 'mailclient.dashboardDeskNote.v1'
const SAVE_DEBOUNCE_MS = 400

function readInitialNote(): string {
  try {
    return window.localStorage.getItem(DESK_NOTE_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function DashboardDeskNoteTile(): JSX.Element {
  const { t } = useTranslation()
  const [note, setNote] = useState(readInitialNote)
  const didMountRef = useRef(false)
  const noteRef = useRef(note)

  useEffect(() => {
    noteRef.current = note
  }, [note])

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }

    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(DESK_NOTE_STORAGE_KEY, note)
      } catch {
        // Local-only note: failed saves are intentionally non-blocking.
      }
    }, SAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [note])

  useEffect(() => {
    return () => {
      try {
        window.localStorage.setItem(DESK_NOTE_STORAGE_KEY, noteRef.current)
      } catch {
        // ignore
      }
    }
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
      <textarea
        value={note}
        onChange={(e): void => setNote(e.target.value)}
        placeholder={t('dashboard.deskNote.placeholder')}
        aria-label={t('dashboard.deskNote.ariaLabel')}
        spellCheck
        className="min-h-0 flex-1 resize-none rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/40"
      />
      <div className="mt-1.5 shrink-0 text-[10px] text-muted-foreground">
        {t('dashboard.deskNote.saveHint')}
      </div>
    </div>
  )
}
