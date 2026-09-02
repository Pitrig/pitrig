import { useState } from 'react'
import { t } from '@shared/ui-text'

import { cn } from '@/lib/utils'
import { PageSection } from '@/app/workspace/PageShell'
import {
  documentDraftText,
  parseConfiguration,
  useDeviceStore
} from '@/features/device/device-store'
import {
  CONFIGURATION_DOCUMENT_IDS,
  type ConfigurationDocumentId
} from '@shared/configuration-schema'

export function AdvancedJsonSection({
  working,
  onEdit
}: {
  working: boolean
  onEdit: () => void
}): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const rawDraft = useDeviceStore((state) => state.rawDraft)
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  const setRawDraft = useDeviceStore((state) => state.setRawDraft)
  const [active, setActive] = useState<ConfigurationDocumentId>('dashboard')
  const text = documentDraftText({ rawDraft, draft }, active)
  const broken = rawDraft?.document === active && parseConfiguration(rawDraft.text) === undefined

  return (
    <PageSection
      title={t('configs.advancedJsonSection.advancedJson')}
      description={t('configs.advancedJsonSection.eachDocumentExactlyAsThe')}
      className="px-0 pb-0"
      actions={
        <div aria-label={t('configs.advancedJsonSection.configurationDocuments')} className="flex gap-1" role="tablist">
          {CONFIGURATION_DOCUMENT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === active}
              className={cn(
                'flex h-7 items-center rounded-md px-2 text-xs font-medium transition-colors',
                id === active
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
              onClick={() => setActive(id)}
            >
              {t(`documents.label.${id}`)}
            </button>
          ))}
        </div>
      }
    >
      {broken ? (
        <p className="px-3 pb-2 text-[11px] text-red-400">
          {t('configs.advancedJsonSection.thisIsNotValidJson')}</p>
      ) : null}
      <textarea
        aria-label={t('configs.advancedJsonSection.activeConfigurationJson', { active: t(`documents.label.${active}`) })}
        className="h-96 w-full resize-y rounded-b-xl border-t bg-black/30 p-3 font-mono text-[11px] leading-4 outline-none focus:border-zinc-500 disabled:opacity-50"
        disabled={!hasLocalDraft || working}
        placeholder={t('configs.advancedJsonSection.createOpenOrConnectA')}
        spellCheck={false}
        value={text}
        onChange={(event) => {
          setRawDraft(active, event.target.value)
          onEdit()
        }}
      />
    </PageSection>
  )
}
