import { useState } from 'react'

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
import { CONFIGURATION_DOCUMENT_LABELS } from '@shared/configuration-documents'

/**
 * The raw JSON, one document at a time.
 *
 * A tab shows exactly the bytes that document is sent as, which is the point of
 * an escape hatch: what is on screen is what the board receives. Editing one
 * cannot disturb the other two — the text is merged back over the draft rather
 * than replacing it.
 */
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
      title="Advanced JSON"
      description="Each document exactly as the board receives it."
      className="px-0 pb-0"
      actions={
        // The same tab language the dashboard pages use, at the size a section
        // header carries.
        <div aria-label="Configuration documents" className="flex gap-1" role="tablist">
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
              {CONFIGURATION_DOCUMENT_LABELS[id]}
            </button>
          ))}
        </div>
      }
    >
      {broken ? (
        <p className="px-3 pb-2 text-[11px] text-red-400">
          This is not valid JSON. The board keeps the last valid version until it is.
        </p>
      ) : null}
      <textarea
        aria-label={`${CONFIGURATION_DOCUMENT_LABELS[active]} configuration JSON`}
        className="h-96 w-full resize-y rounded-b-xl border-t bg-black/30 p-3 font-mono text-[11px] leading-4 outline-none focus:border-zinc-500 disabled:opacity-50"
        disabled={!hasLocalDraft || working}
        placeholder="Create, open, or connect a configuration to begin editing."
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
