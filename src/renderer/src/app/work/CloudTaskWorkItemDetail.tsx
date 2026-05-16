import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CloudTaskWorkItem } from '@shared/work-item'
import {
  datetimeLocalValueToIso,
  dueDateInputToStorageIso,
  dueDateInputValue,
  isoToDatetimeLocalValue
} from '@/app/work-items/work-item-datetime'

export interface CloudTaskSaveDraft {
  title: string
  notes: string
  dueIso: string | null
  plannedStartIso: string | null
  plannedEndIso: string | null
}

export interface CloudTaskWorkItemDetailProps {
  item: CloudTaskWorkItem
  accountLine?: string
  saving?: boolean
  onSave: (draft: CloudTaskSaveDraft) => void | Promise<void>
  onDelete: () => void | Promise<void>
}

export function CloudTaskWorkItemDetail({
  item,
  accountLine,
  saving,
  onSave,
  onDelete
}: CloudTaskWorkItemDetailProps): JSX.Element {
  const { t } = useTranslation()
  const [title, setTitle] = useState(item.title)
  const [notes, setNotes] = useState(item.task.notes ?? '')
  const [due, setDue] = useState(() => dueDateInputValue(item.dueAtIso))
  const [plannedStart, setPlannedStart] = useState(() =>
    isoToDatetimeLocalValue(item.planned.plannedStartIso)
  )
  const [plannedEnd, setPlannedEnd] = useState(() =>
    isoToDatetimeLocalValue(item.planned.plannedEndIso)
  )

  useEffect(() => {
    setTitle(item.title)
    setNotes(item.task.notes ?? '')
    setDue(dueDateInputValue(item.dueAtIso))
    setPlannedStart(isoToDatetimeLocalValue(item.planned.plannedStartIso))
    setPlannedEnd(isoToDatetimeLocalValue(item.planned.plannedEndIso))
  }, [item])

  const handleSave = (): void => {
    void onSave({
      title: title.trim() || t('tasks.shell.untitled'),
      notes: notes.trim(),
      dueIso: dueDateInputToStorageIso(due),
      plannedStartIso: datetimeLocalValueToIso(plannedStart),
      plannedEndIso: datetimeLocalValueToIso(plannedEnd)
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {accountLine ? <p className="text-[10px] text-muted-foreground">{accountLine}</p> : null}
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('tasks.shell.fieldTitle')}
        </label>
        <input
          value={title}
          onChange={(e): void => setTitle(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('work.preview.plannedStart')}
        </label>
        <input
          type="datetime-local"
          value={plannedStart}
          onChange={(e): void => setPlannedStart(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('work.preview.plannedEnd')}
        </label>
        <input
          type="datetime-local"
          value={plannedEnd}
          onChange={(e): void => setPlannedEnd(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('tasks.shell.fieldDue')}
        </label>
        <input
          type="date"
          value={due}
          onChange={(e): void => setDue(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="min-h-0 flex-1">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('tasks.shell.fieldNotes')}
        </label>
        <textarea
          value={notes}
          onChange={(e): void => setNotes(e.target.value)}
          rows={8}
          className="h-full min-h-[120px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? t('common.loading') : t('common.save')}
        </button>
        <button
          type="button"
          onClick={(): void => void onDelete()}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('common.delete')}
        </button>
      </div>
    </div>
  )
}
