import { Folder as FolderIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export function SidebarFolderInlineEditor({
  initialValue,
  depth,
  onSubmit,
  onCancel
}: {
  initialValue: string
  depth: number
  onSubmit: (value: string) => Promise<void>
  onCancel: () => void
}): JSX.Element {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  return (
    <div
      className="flex w-full items-center gap-1 rounded-md bg-secondary/40 text-xs"
      style={{ paddingLeft: `${4 + depth * 12}px` }}
    >
      <span className="flex h-6 w-4 shrink-0 items-center justify-center">
        <FolderIcon className="h-3 w-3 text-muted-foreground/70" />
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        autoFocus
        onChange={(e): void => setValue(e.target.value)}
        onKeyDown={(e): void => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void onSubmit(value)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
        onBlur={(): void => {
          void onSubmit(value)
        }}
        className="flex-1 bg-transparent px-1 py-1.5 text-xs text-foreground outline-none"
      />
    </div>
  )
}
