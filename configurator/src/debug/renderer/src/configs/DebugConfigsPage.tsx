import { useMemo, useState } from 'react'
import { t } from '@shared/ui-text'

import { Button } from '@/components/ui/button'
import { PageShell } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { writeEventLog } from '@/lib/event-log'
import { useDebugConfigsStore } from './debug-configs-store'
import { documentJson } from '@shared/configuration-documents'
import {
  CONFIGURATION_DOCUMENT_IDS,
  type ConfigurationDocumentId
} from '@shared/configuration-schema'

type Action = 'read' | 'apply' | 'save' | 'reset'

export function DebugConfigsPage(): React.JSX.Element {
  const connected = useDeviceStore((state) => state.status === 'connected')
  const active = useDeviceStore((state) => state.activeConfiguration)
  const document = useDebugConfigsStore((state) => state.document)
  const edited = useDebugConfigsStore((state) => state.edited)
  const selectDocument = useDebugConfigsStore((state) => state.selectDocument)
  const setEdited = useDebugConfigsStore((state) => state.setEdited)
  const clearEdited = useDebugConfigsStore((state) => state.clearEdited)
  const [busy, setBusy] = useState<Action>()
  const [note, setNote] = useState<string>()

  const onBoard = useMemo(
    () => (active ? JSON.stringify(JSON.parse(documentJson(active, document)), null, 2) : ''),
    [active, document]
  )
  const text = edited ?? onBoard
  const dirty = edited !== undefined && edited !== onBoard

  function select(id: ConfigurationDocumentId): void {
    selectDocument(id)
    setNote(undefined)
  }

  async function run(action: Action): Promise<void> {
    setBusy(action)
    setNote(undefined)
    try {
      if (action === 'read') {
        const result = await window.pitrig.readDeviceConfiguration()
        setNote(result.ok ? 'Read from the board.' : result.error.message)
        if (result.ok) clearEdited()
      } else if (action === 'reset') {
        const result = await window.pitrig.resetDeviceConfiguration({ document })
        if (!result.ok) setNote(result.error.message)
        else {
          clearEdited()
          const reread = await window.pitrig.readDeviceConfiguration()
          setNote(
            reread.ok
              ? `Reset ${document} to its factory payload.`
              : `Reset ${document}, but reading it back failed: ${reread.error.message}`
          )
        }
      } else {
        const request = { json: JSON.stringify(JSON.parse(text)), documents: [document] }
        if (action === 'apply') {
          const result = await window.pitrig.applyDeviceConfiguration(request)
          setNote(result.ok ? appliedNote(document, result.value.documents) : result.error.message)
        } else {
          const result = await window.pitrig.saveDeviceConfiguration(request)
          setNote(result.ok ? `Saved ${document}.` : result.error.message)
          if (result.ok) clearEdited()
        }
      }
      writeEventLog(`Debugger configs: ${action} ${document}`)
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'The document is not valid JSON.')
    } finally {
      setBusy(undefined)
    }
  }

  const disabled = !connected || busy !== undefined

  return (
    <PageShell
      title="Configs"
      description="Read a document off the board, edit its JSON, then apply or save it."
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {CONFIGURATION_DOCUMENT_IDS.map((id) => (
            <Button
              key={id}
              variant={id === document ? 'default' : 'outline'}
              onClick={() => select(id)}
            >
              {t(`documents.label.${id}`)}
            </Button>
          ))}
          <span className="ml-auto flex items-center gap-2">
            <Button variant="outline" disabled={disabled} onClick={() => void run('read')}>
              Load from board
            </Button>
            <Button variant="outline" disabled={disabled} onClick={() => void run('apply')}>
              Apply
            </Button>
            <Button disabled={disabled} onClick={() => void run('save')}>
              Save
            </Button>
            <Button variant="outline" disabled={disabled} onClick={() => void run('reset')}>
              Reset
            </Button>
          </span>
        </div>
        <textarea
          className="min-h-0 flex-1 resize-none rounded-md border bg-background p-3 font-mono text-xs"
          spellCheck={false}
          value={text}
          onChange={(event) => setEdited(event.target.value)}
          aria-label={`${document} document JSON`}
        />
        <p className="flex-none text-xs text-muted-foreground">
          {note ?? (dirty ? 'Edited — not on the board yet.' : 'Matches what the board stores.')}
        </p>
      </div>
    </PageShell>
  )
}

function appliedNote(
  document: ConfigurationDocumentId,
  applied: readonly ConfigurationDocumentId[]
): string {
  return applied.includes(document)
    ? `Applied ${document}.`
    : `Nothing was sent — ${document} reaches the board only through Save and a restart.`
}
