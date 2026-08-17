import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { writeDevelopmentLog } from '@/features/development/development-log'
import {
  draftText,
  parseConfiguration,
  useDeviceStore
} from '@/features/device/device-store'
import { configurationsEqual } from '../../../../shared/configuration-access'
import {
  validateConfigurationDocument,
  type ValidationResult
} from '../../../../shared/configuration-validate'
import { useDashboardEditorStore } from '@/features/configuration/dashboard-editor'
import { useLiveApply, type LiveApplyState } from '@/features/device/use-live-apply'
import { useFontAssetsStore } from '@/features/font-assets/font-assets-store'
import {
  collectFontRequirements,
  groupFontRequirements,
  missingFontFamilies
} from '@/features/font-assets/font-requirements'
import {
  MAXIMUM_CONFIGURATION_PAYLOAD_SIZE,
  SIMCORE_BOARD_IDS,
  type DeviceConfiguration,
  type DeviceResult,
  type SimCoreBoardId
} from '../../../../shared/device'

type Operation =
  | 'idle'
  | 'load_file'
  | 'save_file'
  | 'read'
  | 'save'
  | 'reset'
  | 'reboot'
type Feedback = { kind: 'success' | 'error'; message: string }

const BOARD_OPTIONS: Array<{ id: SimCoreBoardId; label: string }> = [
  { id: 't_display_s3', label: 'T-Display S3 · 320 × 170' },
  { id: 'guition_esp32_4848s040', label: 'Guition 4848S040 · 480 × 480' },
  { id: 'guition_jc1060p470c', label: 'Guition JC1060P470C · 1024 × 600' }
]

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
  const reloadDraft = useDeviceStore((state) => state.reloadDraft)
  const markSaved = useDeviceStore((state) => state.markConfigurationSaved)
  const markReset = useDeviceStore((state) => state.markConfigurationReset)
  const [liveApply, setLiveApply] = useState<LiveApplyState>({ pending: false })
  const [operation, setOperation] = useState<Operation>('idle')
  const [feedback, setFeedback] = useState<Feedback>()
  const [offlineBoard, setOfflineBoard] = useState<SimCoreBoardId | ''>('')
  // A different document is a different set of widgets, so the selection, the
  // locked and hidden layers and the zoom all describe nothing any more.
  const resetEditorState = useDashboardEditorStore((state) => state.resetEditorState)
  const selectedNewBoard = session?.info.boardId ?? offlineBoard

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
  useLiveApply(
    connected && !busy && parsed.ok && !boardMismatch,
    setLiveApply
  )

  const saveBlockedReason = !connected
    ? 'Connect a SimCore board before saving.'
    : boardMismatch
      ? `Local configuration targets ${parsed.ok ? parsed.configuration.board : 'another board'}, but the connected board is ${session?.info.boardId}.`
      : !parsed.ok
        ? parsed.error
        : !session?.info.storageAvailable
          ? 'Persistent configuration storage is unavailable on this board.'
          : !dirty && missingFamilies.length === 0
            ? 'The draft already matches the active or pending configuration.'
            : undefined

  const run = async <T,>(
    nextOperation: Operation,
    action: () => Promise<DeviceResult<T>>,
    onSuccess: (value: T) => string
  ): Promise<void> => {
    setOperation(nextOperation)
    setFeedback(undefined)
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
    if (!selectedNewBoard) {
      setFeedback({ kind: 'error', message: 'Select a board before creating a configuration.' })
      return
    }
    if (hasLocalDraft && !window.confirm('Discard the current local draft and create a new configuration?')) {
      return
    }
    replaceLocalDraft({ board: selectedNewBoard })
    resetEditorState()
    setFeedback({ kind: 'success', message: `New ${selectedNewBoard} configuration created locally.` })
  }

  const loadFile = async (): Promise<void> => {
    if (hasLocalDraft && !window.confirm('Discard the current local draft and load a JSON file?')) {
      return
    }
    setOperation('load_file')
    setFeedback(undefined)
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
    if (missingFamilies.length > 0) {
      const fontInfo = session?.fontAssets
      if (!fontInfo) {
        setFeedback({ kind: 'error', message: 'The connected firmware cannot report installed font assets.' })
        return
      }
      if (!fontInfo.storageAvailable) {
        setFeedback({ kind: 'error', message: 'Font asset storage is unavailable on this board.' })
        return
      }
      if (fontInfo.rebootRequired) {
        setFeedback({ kind: 'error', message: 'Restart the board before replacing its font package.' })
        return
      }
      if (!window.confirm(
        `${missingFamilies.length} required font famil${missingFamilies.length === 1 ? 'y is' : 'ies are'} missing. Upload the complete font set before saving the configuration?`
      )) return

      const fontStore = useFontAssetsStore.getState()
      const missingSources = [...groupFontRequirements(requiredFonts).keys()].filter(
        (family) => !fontStore.sources[family]
      )
      if (missingSources.length > 0) {
        const message = `Choose a TTF or OTF source for: ${missingSources.join(', ')}.`
        fontStore.setError(message)
        setFeedback({ kind: 'error', message })
        return
      }

      setOperation('save')
      setFeedback(undefined)
      fontStore.beginOperation()
      // The package is replaced whole, so every family the configuration needs
      // is uploaded, not only the missing ones.
      const fontRequest = {
        assets: [...groupFontRequirements(requiredFonts).keys()].map((family) => ({
          sourceId: fontStore.sources[family]!.id,
          family
        }))
      }
      writeDevelopmentLog('Automatic font upload requested', fontRequest)
      let fontResult: Awaited<ReturnType<typeof window.simcore.uploadFontAssets>>
      try {
        fontResult = await window.simcore.uploadFontAssets(fontRequest)
      } catch (error) {
        const message = operationErrorMessage(error)
        fontStore.setError(message)
        setFeedback({ kind: 'error', message })
        setOperation('idle')
        return
      }
      writeDevelopmentLog('Automatic font upload completed', fontResult)
      if (!fontResult.ok) {
        fontStore.setError(fontResult.error.message)
        setFeedback({ kind: 'error', message: fontResult.error.message })
        setOperation('idle')
        return
      }
    } else {
      setOperation('save')
      setFeedback(undefined)
    }

    try {
      const result = await window.simcore.saveDeviceConfiguration({ json: draftJson })
      writeDevelopmentLog('Configuration save completed', result)
      if (!result.ok) {
        setFeedback({ kind: 'error', message: result.error.message })
        return
      }
      markSaved(result.value.configuration)
      setFeedback({ kind: 'success', message: 'Fonts and configuration saved. Reboot the board to activate them.' })
    } catch (error) {
      setFeedback({ kind: 'error', message: operationErrorMessage(error) })
    } finally {
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
        <CardDescription>Visual edits and advanced JSON share the same schema 3 draft.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 rounded-md border p-2">
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            <span>New configuration board</span>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
              disabled={busy || connected}
              value={selectedNewBoard}
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
              disabled={busy || !selectedNewBoard}
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

function operationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (
    message.includes('saveDeviceConfiguration') ||
    message.includes('No handler registered')
  ) {
    return 'The configuration bridge is not loaded. Fully restart SimCore Configurator and reconnect the board.'
  }
  return message || 'The configuration operation failed.'
}

function bridgeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (
    message.includes('not a function') ||
    message.includes('No handler registered')
  ) {
    return 'The Electron bridge is outdated. Fully restart SimCore Configurator.'
  }
  return message || 'The configuration file operation failed.'
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
