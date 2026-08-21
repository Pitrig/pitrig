import { FileJson, FolderOpen, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState, PageSection, PageShell } from '@/app/workspace/PageShell'
import {
  documentDraftText,
  parseConfiguration,
  useDeviceStore
} from '@/features/device/device-store'
import { useDraftState } from '@/features/device/draft-state'
import {
  SaveFeedbackNote,
  SaveProgressBar,
  SaveToBoardButton
} from '@/features/device/save-to-board-ui'
import {
  saveDraftToBoard,
  useSaveToBoardStore
} from '@/features/device/save-to-board-store'
import { transferReportLines } from '@/features/configuration/transfer-report'
import { useEditorPanelStore } from './editor/panel-store'
import { BOARD_NAMES, boardLabel, fitOutcome } from './board-labels'
import { useConfigurationLibrary } from './config-library-store'
import {
  convertDraftToBoard,
  createConfiguration,
  loadDocumentFromBoard,
  openConfigurationFile,
  openRecentConfiguration,
  openSavedConfiguration,
  readConfigurationFromBoard,
  resetBoardConfiguration,
  resetBoardDocument,
  restartBoard,
  saveConfigurationFile,
  type ActionFeedback
} from './configuration-actions'
import { useDashboardEditorStore } from './dashboard-editor'
import { diffConfigurations } from '@shared/configuration-diff'
import {
  BOARD_PROFILES,
  SIMCORE_BOARD_IDS,
  type ConfigurationDocumentOutcome,
  type SimCoreBoardId
} from '@shared/device'
import {
  CONFIGURATION_DOCUMENTS,
  CONFIGURATION_DOCUMENT_IDS,
  type ConfigurationDocumentId
} from '@shared/configuration-schema'
import {
  CONFIGURATION_DOCUMENT_LABELS,
  CONFIGURATION_DOCUMENT_SUMMARIES,
  documentOf,
  documentPayloadBytes
} from '@shared/configuration-documents'
import type { LayoutFit, LayoutTransferResult } from '@shared/layout-transfer'
import { MAXIMUM_CONFIGURATION_NAME, configurationIdFor } from '@shared/config-library'

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

          {feedback ? (
            <p
              className={
                feedback.kind === 'error'
                  ? 'rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300'
                  : 'rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300'
              }
            >
              {feedback.message}
            </p>
          ) : null}
        </div>
      </PageSection>

      <BoardDocumentsSection working={working} onAct={act} />

      <ChangesSection />
      <LibrarySection working={working} onFeedback={setFeedback} />

      <AdvancedJsonSection working={working} onEdit={() => setFeedback(undefined)} />
    </PageShell>
  )
}


/**
 * What each of the three documents is doing on the board, and the commands that
 * change it.
 *
 * They are stored, transferred and applied separately, so "the board's
 * configuration" is three answers rather than one — a dashboard can be modified
 * while the transport is in sync, and only one of them costs a restart. A row
 * each is the only honest way to show that.
 */
function BoardDocumentsSection({
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

        {feedback ? (
          <p
            className={
              feedback.kind === 'error'
                ? 'rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300'
                : 'rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300'
            }
          >
            {feedback.message}
          </p>
        ) : null}

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

/**
 * The raw JSON, one document at a time.
 *
 * A tab shows exactly the bytes that document is sent as, which is the point of
 * an escape hatch: what is on screen is what the board receives. Editing one
 * cannot disturb the other two — the text is merged back over the draft rather
 * than replacing it.
 */
function AdvancedJsonSection({
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

/**
 * What saving would change on the board, property by property.
 *
 * "Modified" says a dashboard of hundreds of numbers differs somewhere; this
 * says where. It compares against the pending configuration when there is one,
 * for the same reason the dirty flag does: that is what the board will be
 * holding once it restarts.
 */
function ChangesSection(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const activeConfiguration = useDeviceStore((state) => state.activeConfiguration)
  const pendingConfiguration = useDeviceStore((state) => state.pendingConfiguration)
  const board = pendingConfiguration ?? activeConfiguration
  // One diff per document rather than one over the whole configuration: a baud
  // rate changed alongside a screen full of widgets would otherwise be one row
  // among two hundred, and the two are separate writes now.
  const diffs = useMemo(
    () =>
      board && draft
        ? CONFIGURATION_DOCUMENT_IDS.map((id) => ({
            id,
            diff: diffConfigurations(documentOf(board, id), documentOf(draft, id))
          })).filter((entry) => entry.diff.changes.length > 0 || entry.diff.truncated > 0)
        : [],
    [board, draft]
  )

  return (
    <PageSection
      title="Changes compared with the board"
      description={
        board
          ? 'What a save would write, per document. Widgets are matched by id, so a move reads as a move.'
          : 'Connect a board to compare the draft against what it is holding.'
      }
    >
      {!board || !draft ? (
        <EmptyState title="Nothing to compare">
          The draft is compared against the configuration the connected board has active or
          pending.
        </EmptyState>
      ) : diffs.length === 0 ? (
        <p className="rounded-md border bg-muted/20 p-2 text-muted-foreground">
          The draft matches the board exactly.
        </p>
      ) : (
        <div className="space-y-3">
          {diffs.map(({ id, diff }) => (
            <div key={id}>
              <p className="mb-1 text-[11px] font-medium text-foreground">
                {CONFIGURATION_DOCUMENT_LABELS[id]}
              </p>
              <ul className="space-y-0.5 font-mono text-[11px]">
                {diff.changes.map((change) => (
                  <li
                    key={`${change.kind}:${change.path}`}
                    className="flex items-start gap-2 rounded-md px-2 py-1 odd:bg-muted/20"
                  >
                    <span
                      className={
                        change.kind === 'added'
                          ? 'flex-none text-emerald-400'
                          : change.kind === 'removed'
                            ? 'flex-none text-red-400'
                            : 'flex-none text-sky-400'
                      }
                    >
                      {change.kind === 'added' ? '+' : change.kind === 'removed' ? '−' : '~'}
                    </span>
                    <span className="min-w-0 flex-1 break-words text-foreground">
                      {change.path}
                    </span>
                    <span className="flex-none text-muted-foreground">
                      {change.before !== undefined && change.after !== undefined
                        ? `${change.before} → ${change.after}`
                        : (change.after ?? change.before)}
                    </span>
                  </li>
                ))}
              </ul>
              {diff.truncated > 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {diff.truncated} further changes not listed.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </PageSection>
  )
}

/** The application's own folder of configurations, and the files it has opened. */
function LibrarySection({
  working,
  onFeedback
}: {
  working: boolean
  onFeedback: (feedback: ActionFeedback) => void
}): React.JSX.Element {
  const { library, error, loading, refresh } = useConfigurationLibrary()
  const draft = useDeviceStore((state) => state.draft)
  const resetEditorState = useDashboardEditorStore((state) => state.resetEditorState)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const disabled = working || busy

  const saveToLibrary = async (): Promise<void> => {
    if (!draft) return
    const trimmed = name.trim()
    const id = configurationIdFor(trimmed)
    if (!id) {
      onFeedback({ kind: 'error', message: 'A name needs at least one letter or digit.' })
      return
    }
    if (
      library?.saved.some((entry) => entry.id === id) &&
      !window.confirm(`Replace the saved configuration "${id}"?`)
    ) {
      return
    }
    setBusy(true)
    try {
      const result = await window.simcore.saveConfigurationToLibrary({
        name: trimmed,
        json: JSON.stringify(draft)
      })
      onFeedback(
        result.ok
          ? { kind: 'success', message: `Saved as "${result.value.name}".` }
          : { kind: 'error', message: result.error.message }
      )
      if (result.ok) {
        setName('')
        refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string): Promise<void> => {
    if (!window.confirm(`Delete the saved configuration "${id}"?`)) return
    setBusy(true)
    try {
      const result = await window.simcore.deleteSavedConfiguration({ id })
      if (!result.ok) onFeedback({ kind: 'error', message: result.error.message })
      else refresh()
    } finally {
      setBusy(false)
    }
  }

  const open = async (action: () => Promise<ActionFeedback>): Promise<void> => {
    setBusy(true)
    try {
      const feedback = await action()
      onFeedback(feedback)
      if (feedback.kind === 'success') resetEditorState()
    } finally {
      setBusy(false)
    }
  }

  const forget = async (path: string): Promise<void> => {
    await window.simcore.forgetRecentConfiguration({ path })
    refresh()
  }

  return (
    <>
      <PageSection
        title="Saved configurations"
        description="Kept in the application's own folder, so the list is always accurate."
      >
        {error ? <p className="mb-2 text-[11px] text-red-400">{error}</p> : null}
        {loading && !library ? (
          <p className="text-muted-foreground">Reading the folder…</p>
        ) : library && library.saved.length > 0 ? (
          <ul className="space-y-1">
            {library.saved.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{entry.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {`${BOARD_NAMES[entry.board as SimCoreBoardId] ?? entry.board} · ${entry.screenCount} screen${entry.screenCount === 1 ? '' : 's'} · ${entry.widgetCount} widget${entry.widgetCount === 1 ? '' : 's'} · ${formatWhen(entry.modifiedAt)}`}
                  </span>
                </span>
                <Button
                  className="flex-none"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void open(() => openSavedConfiguration(entry.id))}
                >
                  <FolderOpen aria-hidden="true" className="mr-1.5 size-3.5" />
                  Open
                </Button>
                <Button
                  aria-label={`Delete ${entry.name}`}
                  className="flex-none px-2 text-red-400 hover:text-red-300"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void remove(entry.id)}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<FileJson aria-hidden="true" className="size-6" />}
            title="Nothing saved yet"
          >
            Save the current dashboard below to keep a copy that does not depend on where a file
            happens to live.
          </EmptyState>
        )}
        {library && library.unreadable > 0 ? (
          <p className="mt-2 text-[11px] text-amber-400">
            {`${library.unreadable} file${library.unreadable === 1 ? '' : 's'} in the folder could not be read.`}
          </p>
        ) : null}

        <div className="mt-3 flex items-end gap-2 border-t pt-3">
          <label className="min-w-0 flex-1 space-y-1 text-[11px] text-muted-foreground">
            <span>Save the current draft as</span>
            <input
              className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
              disabled={disabled || !draft}
              maxLength={MAXIMUM_CONFIGURATION_NAME}
              placeholder="endurance"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <Button
            className="flex-none"
            variant="outline"
            disabled={disabled || !draft || name.trim().length === 0}
            onClick={() => void saveToLibrary()}
          >
            Save to library
          </Button>
        </div>
      </PageSection>

      <PageSection
        title="Recent files"
        description="Files opened or saved through the system dialogs, wherever they live."
      >
        {library && library.recent.length > 0 ? (
          <ul className="space-y-1">
            {library.recent.map((entry) => (
              <li
                key={entry.path}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {entry.fileName}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground" title={entry.path}>
                    {entry.missing ? 'No longer at this path' : entry.path}
                  </span>
                </span>
                <Button
                  className="flex-none"
                  variant="outline"
                  disabled={disabled || entry.missing}
                  onClick={() => void open(() => openRecentConfiguration(entry.path))}
                >
                  Open
                </Button>
                <Button
                  aria-label={`Forget ${entry.fileName}`}
                  className="flex-none px-2"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void forget(entry.path)}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No recent files">
            Opening or saving a JSON file through the dialogs lists it here.
          </EmptyState>
        )}
      </PageSection>
    </>
  )
}

function formatWhen(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}
