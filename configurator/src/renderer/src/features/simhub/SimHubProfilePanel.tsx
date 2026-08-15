import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { writeDevelopmentLog } from '@/features/development/development-log'
import { useDeviceStore } from '@/features/device/device-store'
import type { DeviceConfiguration } from '../../../../shared/device'
import {
  allTelemetryFieldNames,
  collectDashboardTelemetry,
  effectiveSimHubBaudRate,
  type SimHubProfileMode
} from '../../../../shared/simhub-profile'

type Feedback = { kind: 'success' | 'error'; message: string }

export function SimHubProfilePanel(): React.JSX.Element {
  const draftJson = useDeviceStore((state) => state.draftConfigurationJson)
  const [mode, setMode] = useState<SimHubProfileMode>('dashboard')
  const [exporting, setExporting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>()
  const parsed = useMemo(() => parseConfiguration(draftJson), [draftJson])

  const selection = useMemo(() => {
    if (!parsed.ok) return undefined
    return mode === 'all'
      ? { fieldNames: allTelemetryFieldNames(), unknownBindings: [] }
      : collectDashboardTelemetry(parsed.configuration)
  }, [mode, parsed])
  const baudRate = parsed.ok ? effectiveSimHubBaudRate(parsed.configuration) : undefined
  const blockedReason = !parsed.ok
    ? parsed.error
    : selection && selection.unknownBindings.length > 0
      ? `Unknown dashboard bindings: ${selection.unknownBindings.join(', ')}`
      : !selection || selection.fieldNames.length === 0
        ? 'The dashboard does not require any telemetry fields.'
        : undefined

  const exportProfile = async (): Promise<void> => {
    if (!selection || baudRate === undefined || blockedReason) return
    setExporting(true)
    setFeedback(undefined)
    const request = { fieldNames: selection.fieldNames, baudRate }
    writeDevelopmentLog('SimHub profile export requested', {
      mode,
      fieldCount: selection.fieldNames.length,
      baudRate
    })
    try {
      const result = await window.simcore.exportSimHubProfile(request)
      writeDevelopmentLog('SimHub profile export completed', result)
      if (!result.ok) {
        setFeedback({ kind: 'error', message: result.error.message })
      } else if (result.value.saved) {
        setFeedback({
          kind: 'success',
          message: `${result.value.fileName ?? 'SimHub profile'} saved with ${selection.fieldNames.length} telemetry fields.`
        })
      }
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: bridgeErrorMessage(error, 'Failed to export the SimHub profile.')
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>SimHub profile</CardTitle>
        <CardDescription>Generate a Custom Serial Device profile for this dashboard.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <fieldset className="grid gap-2" disabled={exporting}>
          <ProfileModeOption
            checked={mode === 'dashboard'}
            description="Only bindings and module inputs used by the current draft dashboard."
            label="Dashboard only"
            onChange={() => {
              setMode('dashboard')
              setFeedback(undefined)
            }}
          />
          <ProfileModeOption
            checked={mode === 'all'}
            description="The complete canonical telemetry catalog."
            label="All telemetry"
            onChange={() => {
              setMode('all')
              setFeedback(undefined)
            }}
          />
        </fieldset>

        <div className="flex items-center justify-between rounded-md border bg-muted/20 px-2 py-1.5 text-[11px]">
          <span>{selection ? `${selection.fieldNames.length} fields` : 'No valid draft'}</span>
          <span className="text-muted-foreground">{baudRate ? `${baudRate} baud` : 'Baud unavailable'}</span>
        </div>

        {feedback ? (
          <p className={
            feedback.kind === 'error'
              ? 'rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300'
              : 'rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300'
          }>
            {feedback.message}
          </p>
        ) : null}

        <Button
          className="w-full"
          disabled={exporting || blockedReason !== undefined}
          title={blockedReason}
          onClick={() => void exportProfile()}
        >
          {exporting ? 'Generating…' : 'Generate SimHub profile'}
        </Button>
        {!exporting && blockedReason ? (
          <p className="text-[11px] text-muted-foreground">{blockedReason}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ProfileModeOption({
  checked,
  description,
  label,
  onChange
}: {
  checked: boolean
  description: string
  label: string
  onChange: () => void
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer gap-2 rounded-md border p-2 text-xs">
      <input
        checked={checked}
        className="mt-0.5"
        name="simhub-profile-mode"
        type="radio"
        onChange={onChange}
      />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-[11px] leading-4 text-muted-foreground">{description}</span>
      </span>
    </label>
  )
}

function parseConfiguration(
  json: string
): { ok: true; configuration: DeviceConfiguration } | { ok: false; error: string } {
  try {
    const value: unknown = JSON.parse(json)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: 'The current configuration draft must be a JSON object.' }
    }
    return { ok: true, configuration: value as DeviceConfiguration }
  } catch {
    return { ok: false, error: 'Fix the configuration JSON before generating a profile.' }
  }
}

function bridgeErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('exportSimHubProfile') && message.includes('not a function')
    ? 'The Electron bridge is outdated. Fully restart SimCore Configurator.'
    : message || fallback
}
