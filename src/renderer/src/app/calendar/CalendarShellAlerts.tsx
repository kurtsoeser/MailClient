export interface CalendarShellAlertsProps {
  error: string | null
}

/** Fehlerzeile direkt unter dem Kalender-Header. */
export function CalendarShellAlerts({ error }: CalendarShellAlertsProps): JSX.Element | null {
  return error ? (
    <div className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-[12px] text-destructive">
      {error}
    </div>
  ) : null
}
