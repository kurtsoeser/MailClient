import { NotionSettingsPanel } from '@/components/NotionSettingsPanel'
import type { AppConfig } from '@shared/types'

export interface AccountSetupNotionPanelProps {
  config: AppConfig | null
  busy: boolean
  onBusy: (v: boolean) => void
  onError: (msg: string | null) => void
  onConfigSaved: (config: AppConfig) => void
}

/** Einstellungen → Allgemein → Notion (eigener Chunk). */
export default function AccountSetupNotionPanel({
  config,
  busy,
  onBusy,
  onError,
  onConfigSaved
}: AccountSetupNotionPanelProps): JSX.Element {
  return (
    <NotionSettingsPanel
      config={config}
      busy={busy}
      onBusy={onBusy}
      onError={onError}
      onConfigSaved={onConfigSaved}
    />
  )
}
