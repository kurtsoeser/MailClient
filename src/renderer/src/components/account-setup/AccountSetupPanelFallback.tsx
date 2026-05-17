import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function AccountSetupPanelFallback(): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
      {t('common.loading')}
    </div>
  )
}
