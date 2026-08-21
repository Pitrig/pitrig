import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageSection } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { useDraftState } from '@/features/device/draft-state'
import { SaveFeedbackNote, SaveProgressBar } from '@/features/device/save-to-board-ui'
import { saveDraftToBoard } from '@/features/device/save-to-board-store'
import {
  loadDocumentFromBoard,
  readConfigurationFromBoard,
  resetBoardConfiguration,
  resetBoardDocument,
  restartBoard,
  type ActionFeedback
} from '../configuration-actions'
import { FeedbackNote } from './FeedbackNote'
import type { ConfigurationDocumentOutcome } from '@shared/device'
import { CONFIGURATION_DOCUMENT_IDS } from '@shared/configuration-schema'
import {
  CONFIGURATION_DOCUMENT_LABELS,
  CONFIGURATION_DOCUMENT_SUMMARIES,
  documentPayloadBytes
} from '@shared/configuration-documents'

/**
 * What each of the three documents is doing on the board, and the commands that
 * change it.
 *
 * They are stored, transferred and applied separately, so "the board's
 * configuration" is three answers rather than one — a dashboard can be modified
 * while the transport is in sync, and only one of them costs a restart. A row
 * each is the only honest way to show that.
 */
export function BoardDocumentsSection({
  working,
  onAct
}: {
  working: boolean
  onAct: (action: () => Promise<ActionFeedback | undefined>) => Promise<void>
}): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const activeConfiguration = useDeviceStore((state) => state.activeConfiguration)
  const draft = useDeviceStore((state) => state.draft)
  const { connected, dirtyDocuments, saveBlockedReason } = useDraftState()
  const [feedback, setFeedback] = useState<ActionFeedback>()

  return (
    <PageSection
      title="Configs on the board"
      description="Three documents, stored and written independently."
    >
      <div className="space-y-3">
        <SaveProgressBar />
        <SaveFeedbackNote />
        {!working && saveBlockedReason ? (
          <p className="text-[11px] text-muted-foreground">{saveBlockedReason}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Saving writes only the documents that differ. The board restarts when a font had to
            be installed, or when the protocol config changed — the link is chosen once at
            startup, so that one cannot take effect any other way.
          </p>
        )}

        <ul className="divide-y rounded-md border">
          {CONFIGURATION_DOCUMENT_IDS.map((id) => {
            const stored = session?.info.documents[id]
            const modified = dirtyDocuments.includes(id)
            const bytes = draft ? documentPayloadBytes(draft, id) : 0
            return (
              <li key={id} className="space-y-2 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {CONFIGURATION_DOCUMENT_LABELS[id]}
                      </span>
                      <DocumentStatusBadge
                        connected={connected}
                        modified={modified}
                        outcome={stored?.outcome}
                      />
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {CONFIGURATION_DOCUMENT_SUMMARIES[id]}
                      {draft ? ` · ${bytes} bytes` : ''}
                      {stored?.outcome === 'valid' ? ` · generation ${stored.generation}` : ''}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    disabled={!connected || working || !activeConfiguration || !draft}
                    title="Take this document back from the board, leaving the rest of the draft alone"
                    onClick={() => setFeedback(loadDocumentFromBoard(id))}
                  >
                    Load
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!connected || working || !modified || Boolean(saveBlockedReason)}
                    title="Write only this document to the board"
                    onClick={() => void saveDraftToBoard([id])}
                  >
                    Save
                  </Button>
                  <Button
                    className="text-red-400 hover:text-red-300"
                    variant="outline"
                    disabled={!connected || working || !session?.info.storageAvailable}
                    title="Erase this document from the board's storage"
                    onClick={() => void onAct(() => resetBoardDocument(id))}
                  >
                    Reset
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>

        <FeedbackNote feedback={feedback} />

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={!connected || working}
            onClick={() => void onAct(readConfigurationFromBoard)}
          >
            Load all from board
          </Button>
          <Button
            variant="outline"
            disabled={!connected || working}
            onClick={() => void onAct(restartBoard)}
          >
            Restart board
          </Button>
          <Button
            className="col-span-2 text-red-400 hover:text-red-300"
            variant="outline"
            disabled={!connected || working || !session?.info.storageAvailable}
            onClick={() => void onAct(resetBoardConfiguration)}
          >
            Reset to factory configuration
          </Button>
        </div>
      </div>
    </PageSection>
  )
}

/**
 * One document's standing, in one word.
 *
 * A stored record that the board refused is the case worth colouring: it looks
 * exactly like never having configured that section, and the difference is that
 * something is wrong with bytes that are there.
 */
function DocumentStatusBadge({
  connected,
  modified,
  outcome
}: {
  connected: boolean
  modified: boolean
  outcome?: ConfigurationDocumentOutcome
}): React.JSX.Element | null {
  if (!connected) return null
  if (outcome && outcome !== 'valid' && outcome !== 'absent') {
    return (
      <Badge className="border-red-500/40 bg-red-500/15 text-red-300" variant="outline">
        Refused
      </Badge>
    )
  }
  if (modified) {
    return (
      <Badge className="border-sky-500/40 bg-sky-500/15 text-sky-300" variant="outline">
        Modified
      </Badge>
    )
  }
  if (outcome === 'absent') {
    return (
      <Badge className="text-muted-foreground" variant="outline">
        Factory
      </Badge>
    )
  }
  return (
    <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300" variant="outline">
      In sync
    </Badge>
  )
}
