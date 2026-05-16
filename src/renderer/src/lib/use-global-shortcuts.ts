import { useEffect } from 'react'
import { useMailStore } from '@/stores/mail'
import { useComposeStore } from '@/stores/compose'
import { useSnoozeUiStore } from '@/stores/snooze-ui'
import { useUndoStore } from '@/stores/undo'
import { useAppModeStore } from '@/stores/app-mode'

/**
 * Zentrales Tastatur-Shortcut-System fuer die App.
 *
 * Navigation:
 *   J / ArrowDown      -> naechste Mail
 *   K / ArrowUp        -> vorige Mail
 *
 * Triage (nur wenn eine Mail ausgewaehlt ist):
 *   R                  -> Antworten
 *   Shift+R            -> Allen antworten
 *   L                  -> Weiterleiten
 *   U                  -> Lese-/Ungelesen-Status umschalten
 *   F                  -> Stern umschalten
 *   A                  -> Archivieren
 *   Del / Backspace    -> Loeschen
 *   E                  -> Erledigt (Archive, wie Outlook QuickStep)
 *   T                  -> ToDo Heute
 *   M                  -> ToDo Morgen
 *   G                  -> ToDo diese Woche
 *   P                  -> ToDo spaeter
 *   S                  -> Snooze
 *   W                  -> Warten auf Antwort (7 T.) / Warten beenden
 *   Strg+Z             -> Letzte Aktion rueckgaengig
 *
 * Stubs (kommen in MVP-2-Folgeschritten):
 *   (keine)
 *
 * Eingaben in <input>/<textarea>/contenteditable werden ignoriert.
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      const shellMode = useAppModeStore.getState().mode
      if (
        shellMode === 'home' ||
        shellMode === 'calendar' ||
        shellMode === 'chat'
      ) {
        return
      }

      // Compose-Fenster offen? Triage-Shortcuts sollen die Mail nicht aendern,
      // waehrend der User eine Antwort schreibt. Navigation per J/K bleibt
      // erlaubt, weil sich die Lese-Auswahl aendern darf.
      const composeOpen = useComposeStore.getState().drafts.length > 0

      const mail = useMailStore.getState()
      const compose = useComposeStore.getState()
      const undo = useUndoStore.getState()
      const selectedId = mail.selectedMessageId
      const selected = mail.selectedMessage

      const key = e.key
      const lower = key.toLowerCase()

      // Strg+Z -> letzte Aktion rueckgaengig
      if ((e.ctrlKey || e.metaKey) && lower === 'z' && !e.shiftKey) {
        e.preventDefault()
        void undo.undoLast()
        return
      }

      // Navigation
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (key === 'ArrowDown' || (!e.shiftKey && lower === 'j')) {
          e.preventDefault()
          mail.selectNextMessage()
          return
        }
        if (key === 'ArrowUp' || (!e.shiftKey && lower === 'k')) {
          e.preventDefault()
          mail.selectPrevMessage()
          return
        }
      }

      if (composeOpen) return
      if (selectedId == null || !selected) return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      // Triage
      if (lower === 'r' && e.shiftKey) {
        e.preventDefault()
        compose.openReply('replyAll', selected)
        return
      }
      if (lower === 'r') {
        e.preventDefault()
        compose.openReply('reply', selected)
        return
      }
      if (lower === 'l') {
        e.preventDefault()
        compose.openForward(selected)
        return
      }
      if (lower === 'u') {
        e.preventDefault()
        void mail.setMessageRead(selected.id, !selected.isRead)
        return
      }
      if (lower === 'f') {
        e.preventDefault()
        void mail.toggleMessageFlag(selected.id)
        return
      }
      if (lower === 'a' || lower === 'e') {
        e.preventDefault()
        void mail.archiveMessage(selected.id)
        return
      }
      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault()
        if (mail.listKind === 'todo') {
          void mail.removeMailTodoRecordsForMessage(selected.id)
        } else {
          void mail.deleteMessage(selected.id)
        }
        return
      }

      if (lower === 's') {
        e.preventDefault()
        // Picker zentriert oben rechts oeffnen, mit etwas Abstand zur
        // Topbar. Trifft die Stelle, an der die Triage-Bar den Button hat.
        useSnoozeUiStore.getState().open(selected.id, {
          x: Math.max(window.innerWidth - 320, 8),
          y: 80
        })
        return
      }

      if (lower === 't') {
        e.preventDefault()
        void mail.setTodoForMessage(selected.id, 'today')
        return
      }
      if (lower === 'm') {
        e.preventDefault()
        void mail.setTodoForMessage(selected.id, 'tomorrow')
        return
      }
      if (lower === 'g') {
        e.preventDefault()
        void mail.setTodoForMessage(selected.id, 'this_week')
        return
      }
      if (lower === 'p') {
        e.preventDefault()
        void mail.setTodoForMessage(selected.id, 'later')
        return
      }
      if (lower === 'w') {
        e.preventDefault()
        if (selected.waitingForReplyUntil) {
          void mail.clearWaitingForMessage(selected.id)
        } else {
          void mail.setWaitingForMessage(selected.id, 7)
        }
        return
      }

      // Keine weiteren Triage-Stubs.
    }

    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [])
}
