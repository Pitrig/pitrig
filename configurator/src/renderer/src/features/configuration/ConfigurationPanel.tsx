import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { bridgeErrorMessage, operationErrorMessage } from '@/features/device/bridge-errors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { writeDevelopmentLog } from '@/features/development/development-log'
import {
  draftText,
  parseConfiguration,
  useDeviceStore
} from '@/features/device/device-store'
import { configurationsEqual } from '@shared/configuration-access'
import {
  validateConfigurationDocument,
  type ValidationResult
} from '@shared/configuration-validate'
import { useDashboardEditorStore } from '@/features/configuration/dashboard-editor'
import { useLiveApply, type LiveApplyState } from '@/features/device/use-live-apply'
import { UnresolvedFontsDialog } from '@/features/font-library/UnresolvedFontsDialog'
import {
  collectFontRequirements,
  missingFontFamilies
} from '@/features/font-library/font-requirements'
import { isUnresolvedFonts, type SaveProgress } from '@shared/save-to-board'
import {
  applyBoardTransportDefaults,
  BOARD_PROFILES,
  MAXIMUM_CONFIGURATION_PAYLOAD_SIZE,
  SIMCORE_BOARD_IDS,
  type DeviceConfiguration,
  type DeviceResult,
  type SimCoreBoardId
} from '@shared/device'
import { transferConfiguration, type LayoutFit, type LayoutTransferResult } from '@shared/layout-transfer'
import { transferReportLines } from '@/features/configuration/transfer-report'

type Operation =
  | 'idle'
  | 'load_file'
  | 'save_file'
  | 'read'
  | 'save'
  | 'reset'
  | 'reboot'
type Feedback = { kind: 'success' | 'error'; message: string }

// The contract identifies a board; only the marketing name is ours to keep.
// The dimensions come from the board profile rather than being retyped here,
// because a label that disagrees with the geometry a transfer scales to is a
// label that will eventually mislead somebody.
const BOARD_NAMES: Record<SimCoreBoardId, string> = {
  t_display_s3: 'T-Display S3',
  guition_esp32_4848s040: 'Guition 4848S040',
  guition_jc1060p470c: 'Guition JC1060P470C'
}

function boardLabel(board: SimCoreBoardId): string {
  const { width, height } = BOARD_PROFILES[board].display
  return `${BOARD_NAMES[board]} · ${width} × ${height}`
}

const BOARD_OPTIONS: Array<{ id: SimCoreBoardId; label: string }> = SIMCORE_BOARD_IDS.map(
  (id) => ({ id, label: boardLabel(id) })
)

export function ConfigurationPanel(): React.JSX.Element {
  const status = useDeviceStore((state) => state.status)
  const session = useDeviceStore((state) => state.session)
  const activeConfiguration = useDeviceStore((state) => state.activeConfiguration)
  const draft = useDeviceStore((state) => state.draft)
  const rawDraft = useDeviceStore((state) => state.rawDraft)
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  const draftFileName = useDeviceStore((state) => state.draftFileName)
  const pendingConfiguration = useDeviceStore((state) => state.pendingConfiguration)
  const rebootRequired = useDeviceStore((state) => state.rebootRequired)
  const setRawDraft = useDeviceStore((state) => state.setRawDraft)
  const replaceLocalDraft = useDeviceStore((state) => state.replaceLocalDraft)
  const setDraft = useDeviceStore((state) => state.setDraft)
  const reloadDraft = useDeviceStore((state) => state.reloadDraft)
  const markSaved = useDeviceStore((state) => state.markConfigurationSaved)
  // Kept in the store, because a save restarts the board and the reconnect
  // remounts this panel — local state would not survive to be read.
  const saveFeedback = useDeviceStore((state) => state.saveFeedback)
  const setSaveFeedback = useDeviceStore((state) => state.setSaveFeedback)
  const markReset = useDeviceStore((state) => state.markConfigurationReset)
  const [liveApply, setLiveApply] = useState<LiveApplyState>({ pending: false })
  const [operation, setOperation] = useState<Operation>('idle')
  const [feedback, setFeedback] = useState<Feedback>()
  const [offlineBoard, setOfflineBoard] = useState<SimCoreBoardId | ''>('')
  const [report, setReport] = useState<LayoutTransferResult>()
  const [fit, setFit] = useState<LayoutFit>('contain')
  const [saveProgress, setSaveProgress] = useState<SaveProgress>()
  const [unresolvedFonts, setUnresolvedFonts] = useState<string[]>()
  // A different document is a different set of widgets, so the selection, the
  // locked and hidden layers and the zoom all describe nothing any more.
  const resetEditorState = useDashboardEditorStore((state) => state.resetEditorState)
  const targetBoard = session?.info.boardId ?? offlineBoard

  const draftJson = draftText({ rawDraft, draft })
  const parsed = useMemo(
    () => parseDraft(draft, rawDraft, hasLocalDraft),
    [draft, rawDraft, hasLocalDraft]
  )
  // Structural comparison: reordering or reformatting properties no longer
  // makes an identical configuration look modified.
  const comparison = pendingConfiguration ?? activeConfiguration
  const dirty = hasLocalDraft && (!session || !configurationsEqual(draft, comparison))
  const connected = status === 'connected' && Boolean(session)
  const busy = operation !== 'idle'
  const requiredFonts = parsed.ok ? collectFontRequirements(parsed.configuration) : []
  const missingFamilies = missingFontFamilies(
    requiredFonts,
    session?.fontAssets?.families ?? []
  )

  const boardMismatch = parsed.ok && session
    ? parsed.configuration.board !== session.info.boardId
    : false
  // Live apply runs only when the device could accept the document anyway:
  // connected, matching board, valid draft, and no other operation in flight.
  //
  // A family the board does not hold is the fourth case. Firmware rejects such
  // a document whole — apply_configuration.cpp answers `invalid_widget` with
  // `path=font` *before* it tears the running dashboard down — so sending it
  // would only turn a calm sentence into a red error. Note that apply is
  // whole-document: while this is suppressed, no edit reaches the board, not
  // only the font. That is the intent, not an oversight.
  useLiveApply(
    connected && !busy && parsed.ok && !boardMismatch && missingFamilies.length === 0,
    setLiveApply
  )

  const saveBlockedReason = !connected
    ? 'Connect a SimCore board before saving.'
    : boardMismatch
      ? `Local configuration targets ${parsed.ok ? parsed.configuration.board : 'another board'}, but the connected board is ${session?.info.boardId}. Convert the draft to move the layout across.`
      : !parsed.ok
        ? parsed.error
        : !session?.info.storageAvailable
          ? 'Persistent configuration storage is unavailable on this board.'
          : !dirty
            ? 'The draft already matches the active or pending configuration.'
            : undefined

  const run = async <T,>(
    nextOperation: Operation,
    action: () => Promise<DeviceResult<T>>,
    onSuccess: (value: T) => string
  ): Promise<void> => {
    setOperation(nextOperation)
    setFeedback(undefined)
    setReport(undefined)
    try {
      const result = await action()
      writeDevelopmentLog(`Configuration ${nextOperation} completed`, result)
      if (!result.ok) {
        setFeedback({ kind: 'error', message: result.error.message })
        return
      }
      setFeedback({ kind: 'success', message: onSuccess(result.value) })
    } catch (error) {
      const message = operationErrorMessage(error)
      writeDevelopmentLog(`Configuration ${nextOperation} failed`, { message })
      setFeedback({ kind: 'error', message })
    } finally {
      setOperation('idle')
    }
  }

  const newConfiguration = (): void => {
    if (!targetBoard) {
      setFeedback({ kind: 'error', message: 'Select a board before creating a configuration.' })
      return
    }
    if (hasLocalDraft && !window.confirm('Discard the current local draft and create a new configuration?')) {
      return
    }
    replaceLocalDraft(applyBoardTransportDefaults({ board: targetBoard }))
    resetEditorState()
    setReport(undefined)
    setFeedback({ kind: 'success', message: `New ${targetBoard} configuration created locally.` })
  }

  const loadFile = async (): Promise<void> => {
    if (hasLocalDraft && !window.confirm('Discard the current local draft and load a JSON file?')) {
      return
    }
    setOperation('load_file')
    setFeedback(undefined)
    setReport(undefined)
    try {
      const result = await window.simcore.loadConfigurationFile()
      writeDevelopmentLog('Configuration file load completed', result)
      if (!result.ok) {
        setFeedback({ kind: 'error', message: result.error.message })
      } else if (result.value) {
        replaceLocalDraft(result.value.configuration, result.value.fileName)
        resetEditorState()
        setFeedback({ kind: 'success', message: `${result.value.fileName} loaded.` })
      }
    } catch (error) {
      setFeedback({ kind: 'error', message: bridgeErrorMessage(error) })
    } finally {
      setOperation('idle')
    }
  }

  const saveFile = async (): Promise<void> => {
    if (!parsed.ok) {
      setFeedback({ kind: 'error', message: parsed.error })
      return
    }
    setOperation('save_file')
    setFeedback(undefined)
    setReport(undefined)
    try {
      const result = await window.simcore.saveConfigurationFile({ json: draftJson })
      writeDevelopmentLog('Configuration file save completed', result)
      if (!result.ok) {
        setFeedback({ kind: 'error', message: result.error.message })
      } else if (result.value.saved) {
        replaceLocalDraft(parsed.configuration, result.value.fileName)
        resetEditorState()
        setFeedback({
          kind: 'success',
          message: `${result.value.fileName ?? 'Configuration'} saved.`
        })
      }
    } catch (error) {
      setFeedback({ kind: 'error', message: bridgeErrorMessage(error) })
    } finally {
      setOperation('idle')
    }
  }

  const read = async (): Promise<void> => {
    if (dirty && !window.confirm('Discard local configuration changes and read from the board?')) {
      return
    }
    await run('read', () => window.simcore.readDeviceConfiguration(), (state) => {
      if (state.session) {
        reloadDraft(state.session)
        resetEditorState()
      }
      return 'Active configuration read from the board.'
    })
  }

  const save = async (): Promise<void> => {
    if (!parsed.ok) {
      setFeedback({ kind: 'error', message: parsed.error })
      return
    }
    setOperation('save')
    setFeedback(undefined)
    setSaveFeedback(undefined)
    setUnresolvedFonts(undefined)
    setSaveProgress(undefined)
    // One call: the main process resolves the fonts, installs the ones the
    // board lacks, saves, restarts and reconnects. Ordering serial commands
    // from a React component is what this replaced.
    const stopProgress = window.simcore.onSaveProgress(setSaveProgress)
    try {
      const result = await window.simcore.saveToBoard({ json: draftJson })
      writeDevelopmentLog('Save to board completed', result)
      if (!result.ok) {
        if (isUnresolvedFonts(result.error)) setUnresolvedFonts(result.error.families)
        setSaveFeedback({ kind: 'error', message: result.error.message })
        return
      }
      markSaved(result.value.configuration as DeviceConfiguration)
      setSaveFeedback({
        kind: result.value.reconnectFailed ? 'error' : 'success',
        message: result.value.reconnectFailed
          ? 'Saved, but the board did not come back on its port. Reconnect it by hand.'
          : result.value.fontsUploaded
            ? 'Fonts installed and configuration saved. The board is running the new dashboard.'
            : 'Configuration saved. The board is running the new dashboard.'
      })
    } catch (error) {
      setSaveFeedback({ kind: 'error', message: operationErrorMessage(error) })
    } finally {
      stopProgress()
      setSaveProgress(undefined)
      setOperation('idle')
    }
  }

  const reset = async (): Promise<void> => {
    if (!window.confirm('Reset the saved configuration to the board-only factory configuration?')) {
      return
    }
    await run('reset', () => window.simcore.resetDeviceConfiguration(), (result) => {
      markReset(result.configuration)
      return 'Factory configuration saved. Reboot the board to activate it.'
    })
  }

  // Offered only when the draft and the chosen board disagree — which, while a
  // board is connected, is exactly the mismatch that blocks saving.
  const convertTarget =
    parsed.ok && targetBoard && parsed.configuration.board !== targetBoard ? targetBoard : undefined

  const convert = (target: SimCoreBoardId): void => {
    if (!parsed.ok) return
    const from = BOARD_PROFILES[parsed.configuration.board].display
    const to = session?.info.display ?? BOARD_PROFILES[target].display
    if (!window.confirm(`Convert the draft from ${from.width} × ${from.height} to ${to.width} × ${to.height}? ${fitOutcome(from, to, fit)}`)) {
      return
    }
    const transferred = transferConfiguration(parsed.configuration, {
      board: target,
      // The connected board answers for its own display; the profile is what
      // the editor falls back to when nothing is plugged in.
      display: session?.info.display,
      fit
    })
    setReport(transferred)
    // The transfer scales geometry and rewrites the board identifier; the rate
    // the new board needs is not layout, so it is filled in here.
    const converted = applyBoardTransportDefaults(transferred.configuration)
    const validated = validateConfigurationDocument(converted, {
      supportedBoards: SIMCORE_BOARD_IDS
    })
    if (!validated.ok) {
      setFeedback({
        kind: 'error',
        message: `The converted layout would not be accepted, so the draft was left alone. ${validated.error}`
      })
      return
    }
    // setDraft rather than replaceLocalDraft, which is what every other
    // document-replacing handler here uses: this records history, so the
    // conversion is undoable, and a transfer preserves every widget and screen
    // id — so the selection, the locked and hidden layers and the open slot
    // page all still address real widgets. Resetting the editor would throw
    // away state that is still correct.
    setDraft(validated.configuration)
    setFeedback({ kind: 'success', message: `Converted to ${boardLabel(target)}.` })
  }

  const reboot = async (): Promise<void> => {
    if (!window.confirm('Reboot the connected SimCore board now?')) return
    await run('reboot', () => window.simcore.rebootDevice(), () => 'Board is rebooting.')
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Configuration</CardTitle>
          {rebootRequired ? (
            <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-300" variant="outline">
              Reboot required
            </Badge>
          ) : dirty ? (
            <Badge className="border-sky-500/40 bg-sky-500/15 text-sky-300" variant="outline">
              Modified
            </Badge>
          ) : null}
        </div>
        <CardDescription>Visual edits and advanced JSON share the same draft.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 rounded-md border p-2">
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            <span>Board</span>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
              disabled={busy || connected}
              value={targetBoard}
              onChange={(event) => setOfflineBoard(event.target.value as SimCoreBoardId | '')}
            >
              <option value="">Select board</option>
              {BOARD_OPTIONS.map(({ id, label }) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              disabled={busy || !targetBoard}
              onClick={newConfiguration}
            >
              New
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void loadFile()}>
              {operation === 'load_file' ? 'Loading…' : 'Load'}
            </Button>
            <Button
              variant="outline"
              disabled={busy || !parsed.ok}
              onClick={() => void saveFile()}
            >
              {operation === 'save_file' ? 'Saving…' : 'Save'}
            </Button>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {draftFileName ?? (hasLocalDraft ? 'Unsaved local draft' : 'No local configuration')}
          </p>
          {convertTarget ? (
            <div className="space-y-2 rounded-md border border-dashed p-2">
              <label className="block space-y-1 text-[11px] text-muted-foreground">
                <span>Fit to the new display</span>
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
                  disabled={busy}
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
                disabled={busy}
                onClick={() => convert(convertTarget)}
              >
                {`Convert draft to ${BOARD_NAMES[convertTarget]}…`}
              </Button>
            </div>
          ) : null}
        </div>

        <details className="rounded-md border">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Advanced JSON editor</summary>
          <div className="space-y-2 border-t p-2">
            <textarea
              aria-label="Device configuration JSON"
              className="h-80 w-full resize-y rounded-md border bg-black/40 p-2 font-mono text-[11px] leading-4 outline-none focus:border-zinc-500 disabled:opacity-50"
              disabled={!hasLocalDraft || busy}
              placeholder="Create, load, or connect a configuration to begin editing."
              spellCheck={false}
              value={draftJson}
              onChange={(event) => {
                setRawDraft(event.target.value)
                setFeedback(undefined)
              }}
            />
          </div>
        </details>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{parsed.ok ? `${parsed.payloadBytes} bytes` : 'Invalid JSON'}</span>
          <span>{MAXIMUM_CONFIGURATION_PAYLOAD_SIZE} bytes maximum</span>
        </div>
        {/* The validator says exactly which property is wrong and why. Showing
            only "Invalid JSON" left the author to find it themselves. */}
        {parsed.ok ? null : (
          <p className="text-[11px] text-red-400">{parsed.error}</p>
        )}

        {connected && (liveApply.pending || liveApply.error) ? (
          <p
            className={
              liveApply.error
                ? 'rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300'
                : 'rounded-md border p-2 text-xs text-muted-foreground'
            }
          >
            {liveApply.error
              ? `Live preview failed: ${liveApply.error}`
              : 'Applying to the board…'}
          </p>
        ) : null}

        {connected && missingFamilies.length > 0 ? (
          <p className="rounded-md border p-2 text-xs text-muted-foreground">
            The board is still showing the previous font. This preview is configurator-only until
            you save.
          </p>
        ) : null}

        {/* One stream for the whole sequence: the fonts, the configuration, the
            restart and the reconnect are one act as far as the author is
            concerned, so they get one bar. */}
        {saveProgress ? <SaveProgressBar progress={saveProgress} /> : null}

        {(feedback ?? saveFeedback) ? (
          <p
            className={
              (feedback ?? saveFeedback)?.kind === 'error'
                ? 'rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300'
                : 'rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300'
            }
          >
            {(feedback ?? saveFeedback)?.message}
          </p>
        ) : null}

        {unresolvedFonts ? (
          <UnresolvedFontsDialog
            families={unresolvedFonts}
            onRetry={() => {
              setUnresolvedFonts(undefined)
              void save()
            }}
            onClose={() => setUnresolvedFonts(undefined)}
          />
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

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={!connected || busy} onClick={() => void read()}>
            {operation === 'read' ? 'Reading…' : 'Reload board'}
          </Button>
          <Button
            disabled={busy || saveBlockedReason !== undefined}
            title={saveBlockedReason}
            onClick={() => void save()}
          >
            {operation === 'save' ? 'Saving…' : 'Save to board'}
          </Button>
          <Button
            variant="outline"
            disabled={!connected || busy || !session?.info.storageAvailable}
            onClick={() => void reset()}
          >
            {operation === 'reset' ? 'Resetting…' : 'Reset'}
          </Button>
        </div>

        {!busy && saveBlockedReason ? (
          <p className="text-[11px] text-muted-foreground">{saveBlockedReason}</p>
        ) : null}

        <Button className="w-full" disabled={!connected || busy} onClick={() => void reboot()}>
          {operation === 'reboot' ? 'Rebooting…' : 'Reboot board'}
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * What the chosen fit will actually do to this pair of displays, in numbers.
 * "Keep proportions" says nothing about how much of a 480 x 480 board a
 * 1024 x 600 layout will leave empty; the resulting size does.
 */
function fitOutcome(
  from: { width: number; height: number },
  to: { width: number; height: number },
  fit: LayoutFit
): string {
  if (from.width === to.width && from.height === to.height) {
    return 'The display is the same size, so nothing moves.'
  }
  if (fit === 'stretch') {
    return `Each axis is scaled on its own, so the layout fills all ${to.width} × ${to.height}. Round shapes become oval.`
  }
  const scale = Math.min(to.width / from.width, to.height / from.height)
  const width = Math.round(from.width * scale)
  const height = Math.round(from.height * scale)
  return `One factor for both axes, centred: the layout becomes ${width} × ${height} on a ${to.width} × ${to.height} display.`
}

function parseDraft(
  draft: DeviceConfiguration | undefined,
  rawDraft: string | undefined,
  hasLocalDraft: boolean
): ValidationResult {
  if (!hasLocalDraft) return { ok: false, error: 'No local configuration.' }
  // A raw draft that never parsed leaves `draft` at the last good document, so
  // report the text problem rather than validating a stale structure.
  if (rawDraft !== undefined && parseConfiguration(rawDraft) === undefined) {
    return { ok: false, error: 'Configuration is not valid JSON.' }
  }
  if (!draft) return { ok: false, error: 'No local configuration.' }
  return validateConfigurationDocument(draft, { supportedBoards: SIMCORE_BOARD_IDS })
}

/**
 * The save's own progress. `total` is zero for the stages that are one step, so
 * those show an indeterminate bar rather than a bar frozen at nothing — only
 * the upload has real numbers to report, and it reports a lot of them.
 */
function SaveProgressBar({ progress }: { progress: SaveProgress }): React.JSX.Element {
  const percent = progress.total > 0
    ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
    : 0
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/20 p-2 text-[11px] text-muted-foreground">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{SAVE_STAGE_LABELS[progress.stage]}</span>
        {/* Installing faces is the long part and the only interruptible one:
            cancelling it fails the save before the configuration is written,
            which leaves the board exactly as it was. */}
        {progress.stage === 'uploading' ? (
          <button
            type="button"
            className="text-sky-300/70 hover:text-sky-200"
            onClick={() => void window.simcore.cancelFontUpload()}
          >
            Cancel
          </button>
        ) : null}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-sky-500 transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="break-words">{progress.message}</p>
    </div>
  )
}

const SAVE_STAGE_LABELS: Record<SaveProgress['stage'], string> = {
  preparing: 'Checking fonts',
  building: 'Building the font package',
  uploading: 'Installing fonts',
  saving: 'Saving the configuration',
  rebooting: 'Restarting the board',
  reconnecting: 'Reconnecting',
  completed: 'Saved'
}
