import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'
import type { UsageSettings } from '@shared/usage'
import { t } from '@shared/ui-text'

const CARD = 'rounded-xl border bg-card px-4 py-3 text-xs text-card-foreground shadow-sm'

export function UsageSection(): React.JSX.Element | null {
  const [settings, setSettings] = useState<UsageSettings>()
  const [busy, setBusy] = useState(false)
  const [explained, setExplained] = useState(false)

  useEffect(() => {
    void window.pitrig.getUsageSettings().then(setSettings)
  }, [])

  if (!settings) return null
  if (!settings.active) {
    return (
      <section className={cn(CARD, 'text-[11.5px] text-muted-foreground')}>
        {t('usage.section.developmentBuild')}
      </section>
    )
  }

  const toggle = async (): Promise<void> => {
    setBusy(true)
    try {
      setSettings(await window.pitrig.setUsageSettings({ enabled: !settings.enabled }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold">{t('usage.section.title')}</h3>
          <p className="mt-[3px] flex flex-wrap items-center gap-x-1 text-[11.5px] text-muted-foreground">
            <span>{t('usage.section.noNamesFilesOrDashboards')}</span>
            <button
              type="button"
              aria-expanded={explained}
              className="flex items-center gap-0.5 hover:text-foreground"
              onClick={() => setExplained((open) => !open)}
            >
              <ChevronRight
                aria-hidden="true"
                className={cn('size-3 transition-transform', explained && 'rotate-90')}
              />
              {t('usage.section.whatIsSent')}
            </button>
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          aria-label={t('usage.section.title')}
          disabled={busy}
          className="flex flex-none items-center gap-2 text-[11.5px] disabled:opacity-50"
          onClick={() => void toggle()}
        >
          <span
            className={cn(
              'relative h-[17px] w-[30px] rounded-full transition-colors',
              settings.enabled ? 'bg-emerald-400' : 'bg-muted'
            )}
          >
            <span
              className={cn(
                'absolute top-[2px] size-[13px] rounded-full bg-background transition-[left]',
                settings.enabled ? 'left-[15px]' : 'left-[2px]'
              )}
            />
          </span>
          {settings.enabled ? t('usage.section.enabled') : t('usage.section.disabled')}
        </button>
      </div>
      {explained ? (
        <p className="mt-2 text-[11.5px] text-muted-foreground">{t('usage.section.description')}</p>
      ) : null}
    </section>
  )
}
