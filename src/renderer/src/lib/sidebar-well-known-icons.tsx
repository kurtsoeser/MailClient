import type { ComponentType } from 'react'
import {
  Archive,
  CheckCircle2,
  Clock,
  FileText,
  Inbox,
  ListChecks,
  Send,
  Trash2
} from 'lucide-react'

export const SIDEBAR_WELL_KNOWN_FOLDER_ICONS: Record<
  string,
  ComponentType<{ className?: string }>
> = {
  inbox: Inbox,
  sentitems: Send,
  drafts: FileText,
  archive: Archive,
  deleteditems: Trash2,
  snoozed: Clock,
  mailclient_wip: ListChecks,
  mailclient_done: CheckCircle2
}
