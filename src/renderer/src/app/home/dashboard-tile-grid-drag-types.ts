import type { DashboardTilePlacement } from '@/app/home/dashboard-layout'

export type TileDragSession =
  | {
      kind: 'move'
      id: string
      grabOffX: number
      grabOffY: number
      startW: number
      startH: number
      captureEl: HTMLElement | null
      pointerId: number
    }
  | {
      kind: 'groupMove'
      groupIds: string[]
      groupStarts: Record<string, DashboardTilePlacement>
      primaryId: string
      grabOffX: number
      grabOffY: number
      startW: number
      startH: number
      captureEl: HTMLElement | null
      pointerId: number
    }
  | {
      kind: 'resize'
      id: string
      grabOffX: number
      grabOffY: number
      startX: number
      startY: number
      startW: number
      startH: number
      captureEl: HTMLElement | null
      pointerId: number
    }
