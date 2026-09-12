import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { PageSection } from '@/app/workspace/PageShell'
import { bridgeErrorMessage } from '@/features/device/bridge-errors'
import { writeEventLog } from '@/lib/event-log'
import { useDeviceStore } from '@/features/device/device-store'
import {
  allTelemetryFieldNames,
  collectRequiredTelemetry,
  effectiveSimHubBaudRate,
  type SimHubProfileMode
} from '@shared/simhub-profile'
import { t } from '@shared/ui-text'

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
      : collectRequiredTelemetry(draft)
  }, [mode, draft])
  const baudRate = draft ? effectiveSimHubBaudRate(draft) : undefined
  const blockedReason = !draft
    ? t('protocol.simHubProfileSection.theConfigurationDraftIsNot')
    : selection && selection.unknownBindings.length > 0
      ? t('protocol.simHubProfileSection.unknownBindingsBindings', {
          bindings: selection.unknownBindings.join(', ')
        })
      : !selection || selection.fieldNames.length === 0
        ? t('protocol.simHubProfileSection.thisConfigurationDoesNotRequire')
        : undefined

  const exportProfile = async (): Promise<void> => {
    if (!selection || baudRate === undefined || blockedReason) return
    setExporting(true)
    setFeedback(undefined)
    const request = { fieldNames: selection.fieldNames, baudRate }
    writeEventLog('SimHub profile export requested', {
      mode,
      fieldCount: selection.fieldNames.length,
      baudRate
    })
    try {
      const result = await window.pitrig.exportSimHubProfile(request)
      writeEventLog('SimHub profile export completed', result)
      if (!result.ok) {
        setFeedback({ kind: 'error', message: result.error.message })
      } else if (result.value.saved) {
        setFeedback({
          kind: 'success',
          message: t('protocol.simHubProfileSection.fileNameSavedWithFields', {
            fileName:
              result.value.fileName ?? t('protocol.simHubProfileSection.simHubProfile'),
            count: selection.fieldNames.length
          })
        })
      }
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: bridgeErrorMessage(
          error,
          t('protocol.simHubProfileSection.failedToExportTheSimhub')
        )
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <PageSection
      title={t('protocol.simHubProfileSection.simHubProfile')}
      description={t('protocol.simHubProfileSection.generateACustomSerialDevice')}
      actions={
        <Button
          disabled={exporting || blockedReason !== undefined}
          title={blockedReason}
          onClick={() => void exportProfile()}
        >
          {exporting ? t('protocol.simHubProfileSection.generating') : t('protocol.simHubProfileSection.generateProfile')}
        </Button>
      }
    >
      <fieldset className="grid gap-2 sm:grid-cols-2" disabled={exporting}>
        <ProfileModeOption
          checked={mode === 'dashboard'}
          description={t('protocol.simHubProfileSection.onlyTheBindingsAndModule')}
          label={t('protocol.simHubProfileSection.dashboardOnly')}
          onChange={() => {
            setMode('dashboard')
            setFeedback(undefined)
          }}
        />
        <ProfileModeOption
          checked={mode === 'all'}
          description={t('protocol.simHubProfileSection.theCompleteCanonicalTelemetryCatalog')}
          label={t('protocol.simHubProfileSection.allTelemetry')}
          onChange={() => {
            setMode('all')
            setFeedback(undefined)
          }}
        />
      </fieldset>

      <div className="mt-3 flex items-center justify-between rounded-md border bg-muted/20 px-2 py-1.5 text-[11px]">
        <span>{selection ? t('protocol.simHubProfileSection.lengthFields', { length: selection.fieldNames.length }) : t('protocol.simHubProfileSection.noValidDraft')}</span>
        <span className="text-muted-foreground">
          {baudRate ? t('protocol.simHubProfileSection.baudRateBaud', { baudRate: baudRate }) : t('protocol.simHubProfileSection.baudUnavailable')}
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
