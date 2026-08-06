import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { writeDevelopmentLog } from '@/features/development/development-log'
import { formatConfiguration, useDeviceStore } from '@/features/device/device-store'
import { useFontAssetsStore } from '@/features/font-assets/font-assets-store'
import {
  collectFontRequirements,
  groupFontRequirements,
  missingFontRequirements
} from '@/features/font-assets/font-requirements'
import {
  MAXIMUM_CONFIGURATION_PAYLOAD_SIZE,
  type DeviceConfiguration,
  type DeviceResult
} from '../../../../shared/device'
import { FONT_FAMILY_PATTERN, MAXIMUM_FONT_ASSETS } from '../../../../shared/font-assets'

type Operation = 'idle' | 'read' | 'validate' | 'save' | 'reset' | 'reboot'
type Feedback = { kind: 'success' | 'error'; message: string }

export function ConfigurationPanel(): React.JSX.Element {
  const status = useDeviceStore((state) => state.status)
  const session = useDeviceStore((state) => state.session)
  const activeJson = useDeviceStore((state) => state.activeConfigurationJson)
  const draftJson = useDeviceStore((state) => state.draftConfigurationJson)
  const pendingConfiguration = useDeviceStore((state) => state.pendingConfiguration)
  const rebootRequired = useDeviceStore((state) => state.rebootRequired)
  const setDraftJson = useDeviceStore((state) => state.setDraftConfigurationJson)
  const reloadDraft = useDeviceStore((state) => state.reloadDraft)
  const markSaved = useDeviceStore((state) => state.markConfigurationSaved)
  const markReset = useDeviceStore((state) => state.markConfigurationReset)
  const [operation, setOperation] = useState<Operation>('idle')
  const [feedback, setFeedback] = useState<Feedback>()

  const parsed = useMemo(
    () => parseDraft(draftJson, session?.info.boardId),
    [draftJson, session?.info.boardId]
  )
  const comparisonJson = pendingConfiguration
    ? formatConfiguration(pendingConfiguration)
    : activeJson
  const dirty = Boolean(session) && draftJson !== comparisonJson
  const connected = status === 'connected' && Boolean(session)
  const busy = operation !== 'idle'
  const requiredFonts = parsed.ok ? collectFontRequirements(parsed.configuration) : []
  const missingFonts = missingFontRequirements(
    requiredFonts,
    session?.fontAssets?.assets ?? []
  )

  const saveBlockedReason = !connected
    ? 'Connect a SimCore board before saving.'
    : !session?.info.storageAvailable
      ? 'Persistent configuration storage is unavailable on this board.'
      : !dirty && missingFonts.length === 0
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

  const read = async (): Promise<void> => {
    if (dirty && !window.confirm('Discard local configuration changes and read from the board?')) {
      return
    }
    await run('read', () => window.simcore.readDeviceConfiguration(), (state) => {
      if (state.session) reloadDraft(state.session)
      return 'Active configuration read from the board.'
    })
  }

  const validate = async (): Promise<void> => {
    if (!parsed.ok) {
      setFeedback({ kind: 'error', message: parsed.error })
      return
    }
    await run(
      'validate',
      () => window.simcore.validateDeviceConfiguration({ json: draftJson }),
      (configuration) => {
        setDraftJson(formatConfiguration(configuration))
        return 'Firmware accepted the configuration.'
      }
    )
  }

  const save = async (): Promise<void> => {
    if (!parsed.ok) {
      setFeedback({ kind: 'error', message: parsed.error })
      return
    }
    if (missingFonts.length > 0) {
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
        `${missingFonts.length} required font asset${missingFonts.length === 1 ? ' is' : 's are'} missing. Upload the complete font set before saving the configuration?`
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
      const fontRequest = {
        assets: requiredFonts.map((font) => ({
          sourceId: fontStore.sources[font.family]!.id,
          family: font.family,
          sizePx: font.sizePx
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
        <CardDescription>Visual edits and advanced JSON share the same schema 2 draft.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <details className="rounded-md border">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Advanced JSON editor</summary>
          <div className="space-y-2 border-t p-2">
            <textarea
              aria-label="Device configuration JSON"
              className="h-80 w-full resize-y rounded-md border bg-black/40 p-2 font-mono text-[11px] leading-4 outline-none focus:border-zinc-500 disabled:opacity-50"
              disabled={!connected || busy}
              placeholder="Connect a SimCore device to read its configuration."
              spellCheck={false}
              value={draftJson}
              onChange={(event) => {
                setDraftJson(event.target.value)
                setFeedback(undefined)
              }}
            />
          </div>
        </details>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{parsed.ok ? `${parsed.payloadBytes} bytes` : 'Invalid JSON'}</span>
          <span>{MAXIMUM_CONFIGURATION_PAYLOAD_SIZE} bytes maximum</span>
        </div>

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
            {operation === 'read' ? 'Reading…' : 'Reload'}
          </Button>
          <Button variant="outline" disabled={!connected || busy} onClick={() => void validate()}>
            {operation === 'validate' ? 'Validating…' : 'Validate'}
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

function parseDraft(
  json: string,
  expectedBoard: DeviceConfiguration['board'] | undefined
): { ok: true; configuration: DeviceConfiguration; payloadBytes: number } | { ok: false; error: string } {
  if (!expectedBoard) return { ok: false, error: 'No SimCore device is connected.' }
  try {
    const value: unknown = JSON.parse(json)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: 'Configuration must be a JSON object.' }
    }
    const configuration = value as DeviceConfiguration
    if (configuration.board !== expectedBoard) {
      return { ok: false, error: `Configuration board must remain ${expectedBoard}.` }
    }
    const fontError = configurationFontError(configuration)
    if (fontError) return { ok: false, error: fontError }
    const payloadBytes = new TextEncoder().encode(JSON.stringify(configuration)).byteLength
    if (payloadBytes > MAXIMUM_CONFIGURATION_PAYLOAD_SIZE) {
      return {
        ok: false,
        error: `Configuration exceeds the ${MAXIMUM_CONFIGURATION_PAYLOAD_SIZE}-byte device limit.`
      }
    }
    return { ok: true, configuration, payloadBytes }
  } catch {
    return { ok: false, error: 'Configuration is not valid JSON.' }
  }
}

function configurationFontError(configuration: DeviceConfiguration): string | undefined {
  const widgets = configuration.dashboard?.widgets
  const fonts = [] as Array<{ family?: string; size_px?: number } | undefined>
  if (widgets?.delta_time) fonts.push(widgets.delta_time.font)
  for (const widget of widgets?.text ?? []) {
    if (widget.title?.text) fonts.push(widget.title.font)
    fonts.push(widget.value?.font)
  }
  for (const font of fonts) {
    if (
      !font || typeof font.family !== 'string' || !FONT_FAMILY_PATTERN.test(font.family) ||
      !Number.isInteger(font.size_px) || (font.size_px ?? 0) < 1 || (font.size_px ?? 0) > 255
    ) {
      return 'Every dashboard font must explicitly define a valid family and size_px.'
    }
  }
  if (collectFontRequirements(configuration).length > MAXIMUM_FONT_ASSETS) {
    return `Configuration requires more than ${MAXIMUM_FONT_ASSETS} unique font assets.`
  }
  return undefined
}
