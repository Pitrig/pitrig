import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageSection, ReadOnlyField } from '@/app/workspace/PageShell'
import { NumberField, TextField } from '@/features/configuration/inspector/fields'
import {
  startTelemetryBridge,
  stopTelemetryBridge,
  useBridgeStore
} from '@/features/telemetry/bridge-store'
import {
  LINK_DEFAULT_PORT,
  LINK_DEFAULT_SIMHUB_HOST,
  LINK_SOURCE_PORT,
  type LatencyQuantiles,
  type TelemetryBridgeStatus
} from '@shared/telemetry-bridge'
import { t } from '@shared/ui-text'

export function BridgeSection(): React.JSX.Element {
  const status = useBridgeStore((state) => state.status)
  const busy = useBridgeStore((state) => state.busy)
  const [port, setPort] = useState<number>(LINK_DEFAULT_PORT)
  const [simhubHost, setSimhubHost] = useState(LINK_DEFAULT_SIMHUB_HOST)
  const [simhubPort, setSimhubPort] = useState<number>(LINK_SOURCE_PORT)
  const [error, setError] = useState<string>()

  const start = async (): Promise<void> => {
    setError(await startTelemetryBridge({ port, simhubHost, simhubPort }))
  }

  return (
    <PageSection
      title={t('protocol.bridgeSection.title')}
      description={t('protocol.bridgeSection.description')}
      actions={
        status.running ? (
          <Button disabled={busy} variant="outline" onClick={() => void stopTelemetryBridge()}>
            {t('protocol.bridgeSection.stop')}
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => void start()}>
            {busy ? t('protocol.bridgeSection.starting') : t('protocol.bridgeSection.start')}
          </Button>
        )
      }
    >
      <div className="space-y-3">
        <StateChips status={status} />
        <PluginSource
          port={port}
          simhubHost={simhubHost}
          simhubPort={simhubPort}
          status={status}
          onPort={setPort}
          onSimhubHost={setSimhubHost}
          onSimhubPort={setSimhubPort}
        />
        {status.running ? <Measured status={status} /> : null}
        {error ?? status.error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-red-200">
            {error ?? status.error}
          </p>
        ) : null}
      </div>
    </PageSection>
  )
}

function StateChips({ status }: { status: TelemetryBridgeStatus }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={status.running ? 'default' : 'outline'}>
        {status.running ? t('protocol.bridgeSection.running') : t('protocol.bridgeSection.stopped')}
      </Badge>
      {status.running ? (
        <Badge variant="outline">
          {status.receiving
            ? t('protocol.bridgeSection.receiving')
            : t('protocol.bridgeSection.waiting')}
        </Badge>
      ) : null}
      {status.running ? (
        <Badge variant="outline">
          {status.suspended
            ? t('protocol.bridgeSection.suspended')
            : status.relaying
              ? t('protocol.bridgeSection.relaying')
              : t('protocol.bridgeSection.previewOnly')}
        </Badge>
      ) : null}
    </div>
  )
}

function PluginSource({
  port,
  simhubHost,
  simhubPort,
  status,
  onPort,
  onSimhubHost,
  onSimhubPort
}: {
  port: number
  simhubHost: string
  simhubPort: number
  status: TelemetryBridgeStatus
  onPort: (value: number) => void
  onSimhubHost: (value: string) => void
  onSimhubPort: (value: number) => void
}): React.JSX.Element {
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="font-medium text-foreground">{t('protocol.bridgeSection.pluginTitle')}</div>
      <p className="text-[11px] leading-4 text-muted-foreground">
        {t('protocol.bridgeSection.pluginHint')}
      </p>
      <fieldset className="space-y-1 disabled:opacity-50" disabled={status.running}>
        <TextField
          label={t('protocol.bridgeSection.simhubHost')}
          value={simhubHost}
          onChange={onSimhubHost}
        />
        <NumberField
          label={t('protocol.bridgeSection.simhubPort')}
          max={65_535}
          min={1_024}
          step={1}
          value={simhubPort}
          onChange={onSimhubPort}
        />
        <NumberField
          label={t('protocol.bridgeSection.listenPort')}
          max={65_535}
          min={1_024}
          step={1}
          value={port}
          onChange={onPort}
        />
      </fieldset>
      <p className="text-[11px] leading-4 text-muted-foreground">
        {t('protocol.bridgeSection.simhubHostHint')}
      </p>
      {status.simhubAddress ? (
        <ReadOnlyField
          label={t('protocol.bridgeSection.simhubAddress')}
          value={status.simhubAddress}
        />
      ) : null}
      {status.sourceAddress ? (
        <ReadOnlyField label={t('protocol.bridgeSection.source')} value={status.sourceAddress} />
      ) : null}
    </div>
  )
}

function Measured({ status }: { status: TelemetryBridgeStatus }): React.JSX.Element {
  const { metrics } = status
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="font-medium text-foreground">{t('protocol.bridgeSection.measured')}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Quantiles label={t('protocol.bridgeSection.addedLatency')} value={metrics.handoff} />
        <Quantiles label={t('protocol.bridgeSection.drainLatency')} value={metrics.drain} />
        <ReadOnlyField
          label={t('protocol.bridgeSection.lines')}
          value={perSecond(metrics.linesPerSecond)}
        />
        <ReadOnlyField
          label={t('protocol.bridgeSection.fields')}
          value={perSecond(metrics.fieldsPerSecond)}
        />
        <ReadOnlyField
          label={t('protocol.bridgeSection.bytes')}
          value={perSecond(metrics.bytesPerSecond)}
        />
        <ReadOnlyField
          label={t('protocol.bridgeSection.packets')}
          value={perSecond(metrics.packetsPerSecond)}
        />
        <ReadOnlyField
          label={t('protocol.bridgeSection.lostPackets')}
          value={String(metrics.lostPackets)}
        />
        <ReadOnlyField
          label={t('protocol.bridgeSection.dropped')}
          value={`${metrics.droppedBytes} · ${metrics.writeErrors} ${t('protocol.bridgeSection.writeErrors')}`}
        />
      </div>
    </div>
  )
}

function Quantiles({
  label,
  value
}: {
  label: string
  value: LatencyQuantiles
}): React.JSX.Element {
  return (
    <ReadOnlyField
      label={label}
      value={
        value.samples === 0
          ? t('protocol.bridgeSection.noSamples')
          : t('protocol.bridgeSection.quantiles', {
              p50: value.p50.toFixed(3),
              p95: value.p95.toFixed(3),
              p99: value.p99.toFixed(3),
              max: value.max.toFixed(3)
            })
      }
    />
  )
}

function perSecond(value: number): string {
  return `${Math.round(value)}${t('protocol.bridgeSection.perSecond')}`
}
