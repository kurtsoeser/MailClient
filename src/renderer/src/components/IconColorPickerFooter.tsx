import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  ENTITY_ICON_COLOR_PRESETS,
  resolveEntityIconColor
} from '@shared/entity-icon-color'

export function IconColorPickerFooter({
  iconColor,
  onIconColorChange
}: {
  iconColor: string | null | undefined
  onIconColorChange: (iconColor: string | null) => void
}): JSX.Element {
  const { t } = useTranslation()
  const color = resolveEntityIconColor(iconColor)

  return (
    <div className="border-t border-border pt-2">
      <p className="mb-1 px-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        {t('entityIcon.iconColorLabel')}
      </p>
      <div className="grid grid-cols-6 gap-1">
        <button
          type="button"
          title={t('entityIcon.iconColorNone')}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-md border border-border text-[9px] text-muted-foreground hover:bg-secondary/80',
            !color && 'ring-1 ring-primary'
          )}
          onClick={(): void => onIconColorChange(null)}
        >
          —
        </button>
        {ENTITY_ICON_COLOR_PRESETS.map((hex) => (
          <button
            key={hex}
            type="button"
            className={cn(
              'h-6 w-6 rounded-md border border-black/15 shadow-sm',
              color?.toLowerCase() === hex.toLowerCase() && 'ring-2 ring-primary ring-offset-1'
            )}
            style={{ backgroundColor: hex }}
            title={hex}
            onClick={(): void => onIconColorChange(hex)}
          />
        ))}
      </div>
    </div>
  )
}
