import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { PageSection, ReadOnlyField } from '@/app/workspace/PageShell'
import type { UsageSettings } from '@shared/usage'
import { t } from '@shared/ui-text'

export function UsageSection(): React.JSX.Element | null {
  const [settings, setSettings] = useState<UsageSettings>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.pitrig.getUsageSettings().then(setSettings)
  }, [])

  if (!settings) return null

  const toggle = async (): Promise<void> => {
    setBusy(true)
    try {
      setSettings(await window.pitrig.setUsageSettings({ enabled: !settings.enabled }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageSection
      title={t('usage.section.title')}
      description={t('usage.section.description')}
      actions={
        <Button variant="outline" disabled={busy} onClick={() => void toggle()}>
          {settings.enabled ? t('usage.section.turnOff') : t('usage.section.turnOn')}
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <ReadOnlyField
          label={t('usage.section.state')}
          value={settings.enabled ? t('usage.section.enabled') : t('usage.section.disabled')}
        />
      </div>
      {settings.active ? null : (
        <p className="mt-3 text-[11px] text-muted-foreground">{t('usage.section.developmentBuild')}</p>
      )}
    </PageSection>
  )
}
