import { type ReactNode } from 'react'
import { CalendarDockStripFrame, type CalendarDockStripFrameProps } from '@/app/calendar/CalendarDockStripFrame'

interface CalendarDockPanelSlideProps extends CalendarDockStripFrameProps {}

/**
 * Dock-Spalte rechts: dezent von rechts ein-/ausblenden (max-width + translate),
 * damit der Kalenderbereich weich Platz gewinnt bzw. abgibt.
 */
export function CalendarDockPanelSlide(props: CalendarDockPanelSlideProps): JSX.Element {
  return <CalendarDockStripFrame {...props} />
}
