import { FileJson, FolderOpen, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, PageSection, PageShell } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { useDraftState } from '@/features/device/draft-state'
import {
  SaveFeedbackNote,
  SaveProgressBar,
  SaveToBoardButton
} from '@/features/device/save-to-board-ui'
import { useSaveToBoardStore } from '@/features/device/save-to-board-store'
import { transferReportLines } from '@/features/configuration/transfer-report'
import { useEditorPanelStore } from './editor/panel-store'
import { BOARD_NAMES, boardLabel, fitOutcome } from './board-labels'
import { useConfigurationLibrary } from './config-library-store'
import {
  convertDraftToBoard,
  createConfiguration,
  openConfigurationFile,
  openRecentConfiguration,
  openSavedConfiguration,
  readConfigurationFromBoard,
  resetBoardConfiguration,
  restartBoard,
  saveConfigurationFile,
  type ActionFeedback
} from './configuration-actions'
import { useDashboardEditorStore } from './dashboard-editor'
import { diffConfigurations } from '@shared/configuration-diff'
import {
  BOARD_PROFILES,
  MAXIMUM_CONFIGURATION_PAYLOAD_SIZE,
  SIMCORE_BOARD_IDS,
  type SimCoreBoardId
} from '@shared/device'
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
  const setRawDraft = useDeviceStore((state) => state.setRawDraft)
  const saving = useSaveToBoardStore((state) => state.running)
  const { draftJson, parsed, dirty, connected, saveBlockedReason } = useDraftState()

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

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{parsed.ok ? `${parsed.payloadBytes} bytes` : 'Invalid JSON'}</span>
            <span>{MAXIMUM_CONFIGURATION_PAYLOAD_SIZE} bytes maximum</span>
          </div>
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

      <PageSection
        title="Board"
        description="Writing the document to flash, and the two commands that undo it."
      >
        <div className="space-y-3">
          <SaveProgressBar />
          <SaveFeedbackNote />
          {!working && saveBlockedReason ? (
            <p className="text-[11px] text-muted-foreground">{saveBlockedReason}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Saving writes the document to flash and applies it to the running dashboard. The
              board restarts only when a font had to be installed with it.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              disabled={!connected || working}
              onClick={() => void act(readConfigurationFromBoard)}
            >
              Reload board
            </Button>
            <Button
              variant="outline"
              disabled={!connected || working}
              onClick={() => void act(restartBoard)}
            >
              Restart board
            </Button>
            <Button
              className="col-span-2 text-red-400 hover:text-red-300"
              variant="outline"
              disabled={!connected || working || !session?.info.storageAvailable}
              onClick={() => void act(resetBoardConfiguration)}
            >
              Reset to factory configuration
            </Button>
          </div>
        </div>
      </PageSection>

      <ChangesSection />
      <LibrarySection working={working} onFeedback={setFeedback} />

      <PageSection
        title="Advanced JSON"
        description="The same draft the canvas edits, as the board would receive it."
        className="px-0 pb-0"
      >
        <textarea
          aria-label="Device configuration JSON"
          className="h-96 w-full resize-y rounded-b-xl border-t bg-black/30 p-3 font-mono text-[11px] leading-4 outline-none focus:border-zinc-500 disabled:opacity-50"
          disabled={!hasLocalDraft || working}
          placeholder="Create, open, or connect a configuration to begin editing."
          spellCheck={false}
          value={draftJson}
          onChange={(event) => {
            setRawDraft(event.target.value)
            setFeedback(undefined)
          }}
        />
      </PageSection>
    </PageShell>
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
  const diff = useMemo(() => diffConfigurations(board, draft), [board, draft])

  return (
    <PageSection
      title="Changes compared with the board"
      description={
        board
          ? 'What a save would write. Widgets are matched by id, so a move reads as a move.'
          : 'Connect a board to compare the draft against what it is holding.'
      }
    >
      {!board || !draft ? (
        <EmptyState title="Nothing to compare">
          The draft is compared against the configuration the connected board has active or
          pending.
        </EmptyState>
      ) : diff.changes.length === 0 ? (
        <p className="rounded-md border bg-muted/20 p-2 text-muted-foreground">
          The draft matches the board exactly.
        </p>
      ) : (
        <>
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
                <span className="min-w-0 flex-1 break-words text-foreground">{change.path}</span>
                <span className="flex-none text-muted-foreground">
                  {change.before !== undefined && change.after !== undefined
                    ? `${change.before} → ${change.after}`
                    : (change.after ?? change.before)}
                </span>
              </li>
            ))}
          </ul>
          {diff.truncated > 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {diff.truncated} further changes not listed.
            </p>
          ) : null}
        </>
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
  const rawDraft = useDeviceStore((state) => state.rawDraft)
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
        json: rawDraft ?? JSON.stringify(draft)
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
