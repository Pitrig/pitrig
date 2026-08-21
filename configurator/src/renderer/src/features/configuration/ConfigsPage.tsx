import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageSection, PageShell } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { useDraftState } from '@/features/device/draft-state'
import { SaveToBoardButton } from '@/features/device/save-to-board-ui'
import { useSaveToBoardStore } from '@/features/device/save-to-board-store'
import { transferReportLines } from '@/features/configuration/transfer-report'
import { useEditorPanelStore } from './editor/panel-store'
import { BOARD_NAMES, boardLabel, fitOutcome } from './board-labels'
import {
  convertDraftToBoard,
  createConfiguration,
  openConfigurationFile,
  saveConfigurationFile,
  type ActionFeedback
} from './configuration-actions'
import { BoardDocumentsSection } from './configs/BoardDocumentsSection'
import { ChangesSection } from './configs/ChangesSection'
import { AdvancedJsonSection } from './configs/AdvancedJsonSection'
import { LibrarySection } from './configs/LibrarySection'
import { FeedbackNote } from './configs/FeedbackNote'
import { BOARD_PROFILES, SIMCORE_BOARD_IDS, type SimCoreBoardId } from '@shared/device'
import { CONFIGURATION_DOCUMENTS, CONFIGURATION_DOCUMENT_IDS } from '@shared/configuration-schema'
import {
  CONFIGURATION_DOCUMENT_LABELS,
  documentPayloadBytes
} from '@shared/configuration-documents'
import type { LayoutFit, LayoutTransferResult } from '@shared/layout-transfer'

/**
 * The document itself: where it came from, where it goes, and how it differs
 * from what the board is holding.
 *
 * Everything that replaces the whole document lives here rather than beside the
 * canvas — opening a file, converting to another board, resetting to factory —
 * because they all answer "which dashboard am I editing", which is a different
 * question from "what does it look like".
 */

export function ConfigsPage(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draftFileName = useDeviceStore((state) => state.draftFileName)
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  const rebootRequired = useDeviceStore((state) => state.rebootRequired)
  const saving = useSaveToBoardStore((state) => state.running)
  const { parsed, dirty, connected } = useDraftState()

  const offlineBoard = useDeviceStore((state) => state.offlineBoard)
  const setOfflineBoard = useDeviceStore((state) => state.setOfflineBoard)
  const fit = useEditorPanelStore((state) => state.transferFit)
  const setFit = useEditorPanelStore((state) => state.setTransferFit)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<ActionFeedback>()
  const [report, setReport] = useState<LayoutTransferResult>()
  const targetBoard = session?.info.boardId ?? offlineBoard ?? ''
  const working = busy || saving

  const act = async (action: () => Promise<ActionFeedback | undefined>): Promise<void> => {
    setBusy(true)
    setFeedback(undefined)
    setReport(undefined)
    try {
      setFeedback(await action())
    } finally {
      setBusy(false)
    }
  }

  // Offered only when the draft and the chosen board disagree — which, while a
  // board is connected, is exactly the mismatch that blocks saving.
  const convertTarget =
    parsed.ok && targetBoard && parsed.configuration.board !== targetBoard
      ? targetBoard
      : undefined

  const convert = (target: SimCoreBoardId): void => {
    setFeedback(undefined)
    setReport(undefined)
    const result = convertDraftToBoard(target, fit, session?.info.display)
    if (result.report) setReport(result.report)
    if (result.feedback) setFeedback(result.feedback)
  }

  return (
    <PageShell
      title="Configs"
      description="The dashboard document: files, saved copies, and what the board is holding."
      actions={
        <>
          {rebootRequired ? (
            <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-300" variant="outline">
              Restart required
            </Badge>
          ) : dirty ? (
            <Badge className="border-sky-500/40 bg-sky-500/15 text-sky-300" variant="outline">
              Modified
            </Badge>
          ) : null}
          <SaveToBoardButton disabled={busy} />
        </>
      }
    >
      <PageSection
        title="Document"
        description={
          draftFileName ?? (hasLocalDraft ? 'Unsaved local draft' : 'No local configuration')
        }
      >
        <div className="space-y-3">
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            <span>Board</span>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
              disabled={working || connected}
              value={targetBoard}
              onChange={(event) =>
                setOfflineBoard((event.target.value as SimCoreBoardId | '') || undefined)
              }
            >
              <option value="">Select board</option>
              {SIMCORE_BOARD_IDS.map((id) => (
                <option key={id} value={id}>
                  {boardLabel(id)}
                </option>
              ))}
            </select>
            {connected ? (
              <span className="block">The connected board decides this while it is plugged in.</span>
            ) : null}
          </label>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              disabled={working || !targetBoard}
              onClick={() => setFeedback(createConfiguration(targetBoard as SimCoreBoardId))}
            >
              New
            </Button>
            <Button variant="outline" disabled={working} onClick={() => void act(openConfigurationFile)}>
              Open…
            </Button>
            <Button
              variant="outline"
              disabled={working || !parsed.ok}
              title="Save the configuration to a file (Cmd/Ctrl+S)"
              onClick={() => void act(saveConfigurationFile)}
            >
              Save as…
            </Button>
          </div>

          {/* One line per document rather than one total: they are stored and
              sent separately and each has its own bound, so a total would say
              nothing about whether any of them fits. */}
          {parsed.ok ? (
            <div className="space-y-0.5 text-[11px] text-muted-foreground">
              {CONFIGURATION_DOCUMENT_IDS.map((id) => {
                const bytes = documentPayloadBytes(parsed.configuration, id)
                const limit = CONFIGURATION_DOCUMENTS[id].maxPayload
                return (
                  <div key={id} className="flex items-center justify-between">
                    <span>{CONFIGURATION_DOCUMENT_LABELS[id]}</span>
                    <span className={bytes > limit ? 'text-red-400' : undefined}>
                      {bytes} / {limit} bytes
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Invalid JSON</p>
          )}
          {/* The validator says exactly which property is wrong and why. Showing
              only "Invalid JSON" left the author to find it themselves. */}
          {parsed.ok ? null : <p className="text-[11px] text-red-400">{parsed.error}</p>}

          {convertTarget ? (
            <div className="space-y-2 rounded-md border border-dashed p-2">
              <label className="block space-y-1 text-[11px] text-muted-foreground">
                <span>Fit to the new display</span>
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
                  disabled={working}
                  value={fit}
                  onChange={(event) => setFit(event.target.value as LayoutFit)}
                >
                  <option value="contain">Keep proportions, centre</option>
                  <option value="stretch">Stretch to fill the display</option>
                </select>
              </label>
              <p className="text-[11px] text-muted-foreground">
                {parsed.ok
                  ? fitOutcome(
                      BOARD_PROFILES[parsed.configuration.board].display,
                      session?.info.display ?? BOARD_PROFILES[convertTarget].display,
                      fit
                    )
                  : null}
              </p>
              <Button
                className="w-full"
                variant="outline"
                disabled={working}
                onClick={() => convert(convertTarget)}
              >
                {`Convert draft to ${BOARD_NAMES[convertTarget]}…`}
              </Button>
            </div>
          ) : null}

          {report ? (
            <div className="space-y-1 rounded-md border border-sky-500/30 bg-sky-500/10 p-2 text-[11px] text-sky-200">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">Layout transfer</span>
                <button
                  className="text-sky-300/70 hover:text-sky-200"
                  type="button"
                  onClick={() => setReport(undefined)}
                >
                  Dismiss
                </button>
              </div>
              <ul className="list-disc space-y-0.5 pl-4">
                {transferReportLines(report).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <FeedbackNote feedback={feedback} />
        </div>
      </PageSection>

      <BoardDocumentsSection working={working} onAct={act} />

      <ChangesSection />
      <LibrarySection working={working} onFeedback={setFeedback} />

      <AdvancedJsonSection working={working} onEdit={() => setFeedback(undefined)} />
    </PageShell>
  )
}
