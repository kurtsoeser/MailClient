import type { ReactNode } from 'react'
import { FolderInput } from 'lucide-react'
import type { TFunction } from 'i18next'
import type { ContextMenuItem } from '@/components/ContextMenu'

export function buildMailContextMoveMenuEntries(
  moveSubmenuContent: ReactNode | undefined,
  t?: TFunction
): ContextMenuItem[] {
  if (moveSubmenuContent == null) return []
  return [
    { id: 'sep-move-entry', label: '', separator: true },
    {
      id: 'move-mail',
      label: t ? t('mail.move.menu') : 'Verschieben',
      icon: FolderInput,
      submenuContent: moveSubmenuContent
    }
  ]
}
