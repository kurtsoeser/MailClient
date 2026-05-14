import type { CSSProperties } from 'react'

import type { DashboardTilePlacement } from '@/app/home/dashboard-layout'

export function freeTileStyle(p: DashboardTilePlacement, zIndex: number): CSSProperties {
  return {
    position: 'absolute',
    left: p.x,
    top: p.y,
    width: p.w,
    height: p.h,
    zIndex,
    boxSizing: 'border-box'
  }
}

export function marqueeAsPlacement(m: {
  x0: number
  y0: number
  x1: number
  y1: number
}): DashboardTilePlacement {
  const x = Math.min(m.x0, m.x1)
  const y = Math.min(m.y0, m.y1)
  const w = Math.abs(m.x1 - m.x0)
  const h = Math.abs(m.y1 - m.y0)
  return { x, y, w: Math.max(1, w), h: Math.max(1, h) }
}
