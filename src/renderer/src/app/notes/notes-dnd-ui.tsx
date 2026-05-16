import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function NotesDropZone({
  id,
  className,
  children
}: {
  id: string
  className?: string
  children: ReactNode
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md border border-transparent transition-colors',
        isOver && 'border-primary/50 bg-primary/5',
        className
      )}
    >
      {children}
    </div>
  )
}
