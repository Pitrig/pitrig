import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { PageSection } from '@/app/workspace/PageShell'
import { bridgeErrorMessage } from '@/features/device/bridge-errors'
import { writeDebugLog } from '@/features/debug/debug-log'
import { useDeviceStore } from '@/features/device/device-store'
import {
  allTelemetryFieldNames,
  collectDashboardTelemetry,
  effectiveSimHubBaudRate,
  type SimHubProfileMode
} from '@shared/simhub-profile'

type Feedback = { kind: 'success' | 'error'; message: string }

export function SimHubProfileSection(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const [mode, setMode] = useState<SimHubProfileMode>('dashboard')
  const [exporting, setExporting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>()

  const selection = useMemo(() => {
    if (!draft) return undefined
    return mode === 'all'
      ? { fieldNames: allTelemetryFieldNames(), unknownBindings: [] }
      : collectDashboardTelemetry(draft)
  }, [mode, draft])
  const baudRate = draft ? effectiveSimHubBaudRate(draft) : undefined
  const blockedReason = !draft
    ? 'The configuration draft is not valid JSON.'
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
    writeDebugLog('SimHub profile export requested', {
      mode,
      fieldCount: selection.fieldNames.length,
      baudRate
    })
    try {
      const result = await window.simcore.exportSimHubProfile(request)
      writeDebugLog('SimHub profile export completed', result)
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
    <PageSection
      title="SimHub profile"
      description="Generate a Custom Serial Device profile that feeds this dashboard."
      actions={
        <Button
          disabled={exporting || blockedReason !== undefined}
          title={blockedReason}
          onClick={() => void exportProfile()}
        >
          {exporting ? 'Generating…' : 'Generate profile'}
        </Button>
      }
    >
      <fieldset className="grid gap-2 sm:grid-cols-2" disabled={exporting}>
        <ProfileModeOption
          checked={mode === 'dashboard'}
          description="Only the bindings and module inputs the current draft uses."
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

      <div className="mt-3 flex items-center justify-between rounded-md border bg-muted/20 px-2 py-1.5 text-[11px]">
        <span>{selection ? `${selection.fieldNames.length} fields` : 'No valid draft'}</span>
        <span className="text-muted-foreground">
          {baudRate ? `${baudRate} baud` : 'Baud unavailable'}
        </span>
      </div>

      {feedback ? (
        <p
          className={
            feedback.kind === 'error'
              ? 'mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-red-300'
              : 'mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-300'
          }
        >
          {feedback.message}
        </p>
      ) : null}
      {!exporting && blockedReason ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{blockedReason}</p>
      ) : null}
    </PageSection>
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
    <label className="flex cursor-pointer gap-2 rounded-md border p-2">
      <input checked={checked} className="mt-0.5" name="simhub-profile-mode" type="radio" onChange={onChange} />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-[11px] leading-4 text-muted-foreground">{description}</span>
      </span>
    </label>
  )
}
