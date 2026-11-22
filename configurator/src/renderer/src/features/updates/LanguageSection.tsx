import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { confirmAction } from '@/components/ui/confirm-store'
import { Select, type SelectOption } from '@/components/ui/select'
import { useDeviceStore } from '@/features/device/device-store'
import {
  MACHINE_TRANSLATED_LANGUAGES,
  UI_LANGUAGE_NAMES,
  UI_LANGUAGES,
  type UiLanguage,
  type UiLanguageSettings
} from '@shared/ui-language'
import { t } from '@shared/ui-text'

const CARD = 'rounded-xl border bg-card px-4 py-3 text-xs text-card-foreground shadow-sm'
const SYSTEM = 'system'

type LanguageChoice = UiLanguage | typeof SYSTEM

async function restartIntoLanguage(): Promise<void> {
  const { hasLocalDraft } = useDeviceStore.getState()
  if (hasLocalDraft && !(await confirmAction(t('language.section.restartClosesDraft'), { danger: true }))) {
    return
  }
  await window.pitrig.restartForUiLanguage()
}

export function LanguageSection(): React.JSX.Element | null {
  const [settings, setSettings] = useState<UiLanguageSettings>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.pitrig.getUiLanguage().then(setSettings)
  }, [])

  if (!settings) return null

  const options: SelectOption<LanguageChoice>[] = [
    {
      value: SYSTEM,
      label: t('language.section.system', { language: UI_LANGUAGE_NAMES[settings.system] })
    },
    ...UI_LANGUAGES.map((language) => ({ value: language, label: UI_LANGUAGE_NAMES[language] }))
  ]
  const pending = (settings.chosen ?? settings.system) !== settings.active

  const choose = async (choice: LanguageChoice): Promise<void> => {
    setBusy(true)
    try {
      setSettings(await window.pitrig.setUiLanguage({ language: choice === SYSTEM ? null : choice }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold">{t('language.section.title')}</h3>
          <p className="mt-[3px] text-[11.5px] text-muted-foreground">
            {MACHINE_TRANSLATED_LANGUAGES.has(settings.active)
              ? t('language.section.machineTranslated')
              : t('language.section.description')}
          </p>
        </div>
        <Select
          value={settings.chosen ?? SYSTEM}
          options={options}
          onChange={(choice) => void choose(choice)}
          disabled={busy}
          aria-label={t('language.section.title')}
          className="w-48 flex-none"
        />
      </div>
      {pending ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-muted-foreground">{t('language.section.restartToApply')}</p>
          {settings.canRestart ? (
            <Button variant="outline" className="h-7 flex-none px-2.5" onClick={() => void restartIntoLanguage()}>
              {t('language.section.restartNow')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
