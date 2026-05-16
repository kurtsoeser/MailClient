import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

/** Über Modul-Spalten und Glass-Panels, unter App-Modals (z-[300]). */
export const SEARCH_DROPDOWN_Z = 400

export function useSearchDropdownPortal(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  options?: { width?: number; align?: 'left' | 'right' }
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({})

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setStyle({})
      return
    }
    const r = anchorRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = options?.width ?? Math.min(360, Math.max(r.width, 280), vw - 16)
    const align = options?.align ?? 'right'
    let left = align === 'right' ? r.right - width : r.left
    if (left + width > vw - 8) left = vw - 8 - width
    if (left < 8) left = 8
    const maxH = Math.max(160, Math.min(vh - r.bottom - 12, vh * 0.6))
    setStyle({
      position: 'fixed',
      top: r.bottom + 4,
      left,
      width,
      maxHeight: maxH,
      zIndex: SEARCH_DROPDOWN_Z
    })
  }, [anchorRef, open, options?.width, options?.align])

  return style
}
