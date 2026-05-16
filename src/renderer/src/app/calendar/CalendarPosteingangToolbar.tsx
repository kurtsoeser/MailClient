import { PanelRightClose, PanelRightOpen, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderToolbarToggleClass
} from '@/components/ModuleColumnHeader'

export function CalendarPosteingangToolbarButton(props: {
  open: boolean
  onOpenChange: (next: boolean) => void
}): JSX.Element {
  const { open, onOpenChange } = props
  const { t } = useTranslation()
  return (
    <button
      type="button"
      title={open ? t('calendar.posteingangUi.toggleInboxHide') : t('calendar.posteingangUi.toggleInboxShow')}
      aria-pressed={open}
      onClick={(): void => onOpenChange(!open)}
      className={moduleColumnHeaderToolbarToggleClass(open)}
    >
      {open ? (
        <PanelRightClose className={moduleColumnHeaderIconGlyphClass} />
      ) : (
        <PanelRightOpen className={moduleColumnHeaderIconGlyphClass} />
      )}
    </button>
  )
}

export function CalendarPreviewPaneToolbarButton(props: {
  open: boolean
  onOpenChange: (next: boolean) => void
}): JSX.Element {
  const { open, onOpenChange } = props
  const { t } = useTranslation()
  return (
    <button
      type="button"
      title={
        open ? t('calendar.posteingangUi.togglePreviewHide') : t('calendar.posteingangUi.togglePreviewShow')
      }
      aria-pressed={open}
      onClick={(): void => onOpenChange(!open)}
      className={moduleColumnHeaderToolbarToggleClass(open)}
    >
      <BookOpen className={moduleColumnHeaderIconGlyphClass} />
    </button>
  )
}
