import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

export interface AnchoredListViewMenuState {
  open: boolean
  setOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  btnRef: RefObject<HTMLButtonElement>
  panelRef: RefObject<HTMLDivElement>
  panelStyle: CSSProperties
}

export function useAnchoredListViewMenu(): AnchoredListViewMenuState {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(320, vw - 16)
    let left = r.left
    if (left + width > vw - 8) left = vw - 8 - width
    if (left < 8) left = 8
    const maxH = Math.max(200, vh - r.bottom - 12)
    setPanelStyle({
      position: 'fixed',
      top: r.bottom + 4,
      left,
      width,
      maxHeight: maxH
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    function onDown(e: MouseEvent): void {
      const target = e.target as Node
      if (btnRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return (): void => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return { open, setOpen, btnRef, panelRef, panelStyle }
}
