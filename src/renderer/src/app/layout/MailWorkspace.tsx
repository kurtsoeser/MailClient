import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useResizableWidth, VerticalSplitter } from '@/components/ResizableSplitter'
import { Sidebar } from '@/app/layout/Sidebar'
import { MailList } from '@/app/layout/MailList'
import { ReadingPane } from '@/app/layout/ReadingPane'
import { InboxCalendarSidebar } from '@/app/layout/InboxCalendarSidebar'
import { CalendarFloatingPanel } from '@/app/calendar/CalendarFloatingPanel'
import { useMailWorkspaceLayoutStore } from '@/stores/mail-workspace-layout'

const MAIL_FLOAT_READING_SIZE_KEY = 'mailclient.mailWorkspace.readingFloatSize'
const MAIL_FLOAT_CALENDAR_SIZE_KEY = 'mailclient.mailWorkspace.calendarFloatSize'

export function MailWorkspace(props: { onOpenAccountDialog: () => void }): JSX.Element {
  const { t } = useTranslation()
  const [sidebarWidth, setSidebarWidth] = useResizableWidth({
    storageKey: 'mailclient.sidebarWidth',
    defaultWidth: 256,
    minWidth: 180,
    maxWidth: 480
  })
  const [listWidth, setListWidth] = useResizableWidth({
    storageKey: 'mailclient.listWidth',
    defaultWidth: 384,
    minWidth: 260,
    maxWidth: 720
  })
  const [calendarColWidth, setCalendarColWidth] = useResizableWidth({
    storageKey: 'mailclient.inboxCalendarColumnWidth',
    defaultWidth: 348,
    minWidth: 288,
    maxWidth: 560
  })

  const readingPlacement = useMailWorkspaceLayoutStore((s) => s.readingPlacement)
  const calendarPlacement = useMailWorkspaceLayoutStore((s) => s.calendarPlacement)
  const readingOpen = useMailWorkspaceLayoutStore((s) => s.readingOpen)
  const calendarOpen = useMailWorkspaceLayoutStore((s) => s.calendarOpen)
  const setReadingPlacement = useMailWorkspaceLayoutStore((s) => s.setReadingPlacement)
  const setCalendarPlacement = useMailWorkspaceLayoutStore((s) => s.setCalendarPlacement)
  const setReadingOpen = useMailWorkspaceLayoutStore((s) => s.setReadingOpen)
  const setCalendarOpen = useMailWorkspaceLayoutStore((s) => s.setCalendarOpen)

  const onDragSidebar = useCallback(
    (delta: number) => setSidebarWidth((w) => w + delta),
    [setSidebarWidth]
  )
  const onDragList = useCallback(
    (delta: number) => setListWidth((w) => w + delta),
    [setListWidth]
  )
  /** Splitter liegt links von der Kalenderspalte — wie Kalender-Shell / Workflow-Vorschau (`w - delta`). */
  const onDragCalendarCol = useCallback(
    (delta: number) => setCalendarColWidth((w) => w - delta),
    [setCalendarColWidth]
  )

  const dockedReading = readingOpen && readingPlacement === 'dock'
  const dockedCalendar = calendarOpen && calendarPlacement === 'dock'
  const floatReading = readingOpen && readingPlacement === 'float'
  const floatCalendar = calendarOpen && calendarPlacement === 'float'

  const readingFloatWidth = useMemo(
    () => Math.min(720, Math.max(320, Math.round(calendarColWidth + 160))),
    [calendarColWidth]
  )
  const calendarFloatWidth = useMemo(
    () => Math.min(560, Math.max(288, Math.round(calendarColWidth))),
    [calendarColWidth]
  )

  const bothPanelsFloating = floatReading && floatCalendar

  const readingFloatPos = useMemo(() => {
    const x = Math.max(12, window.innerWidth - readingFloatWidth - 20)
    return { x, y: 68 }
  }, [readingFloatWidth])

  const calendarFloatPos = useMemo(() => {
    if (bothPanelsFloating) {
      const px = readingFloatPos.x
      return { x: Math.max(12, px - calendarFloatWidth - 12), y: 68 }
    }
    return { x: Math.max(12, window.innerWidth - calendarFloatWidth - 20), y: 68 }
  }, [bothPanelsFloating, calendarFloatWidth, readingFloatPos.x])

  const requestReadingUndock = useCallback((): void => {
    setReadingPlacement('float')
  }, [setReadingPlacement])
  const requestCalendarUndock = useCallback((): void => {
    setCalendarPlacement('float')
  }, [setCalendarPlacement])

  return (
    <div className="flex flex-1 overflow-hidden">
      <div style={{ width: sidebarWidth }} className="h-full shrink-0">
        <Sidebar onOpenAccountDialog={props.onOpenAccountDialog} />
      </div>
      <VerticalSplitter onDrag={onDragSidebar} ariaLabel={t('mail.workspace.splitterSidebar')} />
      <div style={{ width: listWidth }} className="h-full shrink-0 border-r border-border">
        <MailList />
      </div>
      <VerticalSplitter onDrag={onDragList} ariaLabel={t('mail.workspace.splitterList')} />
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {dockedReading ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <ReadingPane onRequestUndock={requestReadingUndock} />
          </div>
        ) : dockedCalendar ? (
          <div className="min-h-0 min-w-0 flex-1 bg-background" aria-hidden />
        ) : null}

        {dockedCalendar ? (
          <>
            <VerticalSplitter onDrag={onDragCalendarCol} ariaLabel={t('mail.workspace.splitterCalendar')} />
            <div style={{ width: calendarColWidth }} className="h-full shrink-0">
              <InboxCalendarSidebar onRequestUndock={requestCalendarUndock} />
            </div>
          </>
        ) : null}
      </div>

      {floatReading ? (
        <CalendarFloatingPanel
          open
          title={t('mail.workspace.floatReadingTitle')}
          widthPx={readingFloatWidth}
          minHeightPx={360}
          persistSizeKey={MAIL_FLOAT_READING_SIZE_KEY}
          defaultPosition={readingFloatPos}
          zIndex={92}
          onClose={(): void => {
            setReadingOpen(false)
          }}
          onDock={(): void => {
            setReadingPlacement('dock')
          }}
        >
          <ReadingPane />
        </CalendarFloatingPanel>
      ) : null}

      {floatCalendar ? (
        <CalendarFloatingPanel
          open
          title={t('mail.workspace.floatCalendarTitle')}
          widthPx={calendarFloatWidth}
          minHeightPx={360}
          persistSizeKey={MAIL_FLOAT_CALENDAR_SIZE_KEY}
          defaultPosition={calendarFloatPos}
          zIndex={91}
          onClose={(): void => {
            setCalendarOpen(false)
          }}
          onDock={(): void => {
            setCalendarPlacement('dock')
          }}
        >
          <InboxCalendarSidebar hideChrome />
        </CalendarFloatingPanel>
      ) : null}
    </div>
  )
}
