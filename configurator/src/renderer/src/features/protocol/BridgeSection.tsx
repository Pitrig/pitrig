import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageSection, ReadOnlyField } from '@/app/workspace/PageShell'
import { NumberField, TextField } from '@/features/configuration/inspector/fields'
import {
  setBridgeRequest,
  startTelemetryBridge,
  stopTelemetryBridge,
  useBridgeStore
} from '@/features/telemetry/bridge-store'
import type { LatencyQuantiles, TelemetryBridgeStatus } from '@shared/telemetry-bridge'

const text = {
  title: 'Live telemetry',
  description: 'Telemetry from the SimHub plugin, forwarded to the board and decoded on the way, so the dashboard, the lamps and the catalog below show it as it arrives.',
  pluginTitle: 'SimHub plugin',
  pluginHint: 'Install the Pitrig plugin in SimHub and name the machine it runs on. The configurator asks that machine for the stream and forwards what arrives to the board unchanged.',
  listenPort: 'Listen on port',
  simhubHost: 'SimHub machine',
  simhubPort: 'Plugin port',
  simhubHostHint: 'A loopback address keeps everything on this machine. Any other address reaches a plugin over the local network, and telemetry from anywhere else is ignored. The plugin panel shows the addresses of the machine SimHub runs on.',
  simhubAddress: 'Asking',
  source: 'Sending',
  start: 'Start',
  stop: 'Stop',
  starting: 'Starting…',
  running: 'Running',
  stopped: 'Stopped',
  waiting: 'Waiting for the plugin',
  receiving: 'Receiving',
  relaying: 'Forwarding to the board',
  previewOnly: 'No board connected — preview only',
  suspended: 'Held back while the board is busy',
  measured: 'Measured',
  addedLatency: 'Added by the bridge',
  drainLatency: 'Through to the board',
  lines: 'Lines',
  fields: 'Fields',
  bytes: 'Bytes',
  packets: 'Packets',
  lostPackets: 'Lost packets',
  dropped: 'Dropped',
  writeErrors: 'Write errors',
  perSecond: '/s',
  noSamples: 'Nothing measured yet.'
}

export function BridgeSection(): React.JSX.Element {
  const status = useBridgeStore((state) => state.status)
  const busy = useBridgeStore((state) => state.busy)
  const request = useBridgeStore((state) => state.request)
  const [error, setError] = useState<string>()
  const shown = status.running
    ? {
        port: status.port ?? request.port,
        simhubHost: status.simhubAddress ?? request.simhubHost,
        simhubPort: request.simhubPort
      }
    : request

  const start = async (): Promise<void> => {
    setError(await startTelemetryBridge(request))
  }

  return (
    <PageSection
      title={text.title}
      description={text.description}
      actions={
        status.running ? (
          <Button disabled={busy} variant="outline" onClick={() => void stopTelemetryBridge()}>
            {text.stop}
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => void start()}>
            {busy ? text.starting : text.start}
          </Button>
        )
      }
    >
      <div className="space-y-3">
        <StateChips status={status} />
        <PluginSource
          port={shown.port}
          simhubHost={shown.simhubHost}
          simhubPort={shown.simhubPort}
          status={status}
          onPort={(value) => setBridgeRequest({ port: value })}
          onSimhubHost={(value) => setBridgeRequest({ simhubHost: value })}
          onSimhubPort={(value) => setBridgeRequest({ simhubPort: value })}
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
        {status.running ? text.running : text.stopped}
      </Badge>
      {status.running ? (
        <Badge variant="outline">
          {status.receiving
            ? text.receiving
            : text.waiting}
        </Badge>
      ) : null}
      {status.running ? (
        <Badge variant="outline">
          {status.suspended
            ? text.suspended
            : status.relaying
              ? text.relaying
              : text.previewOnly}
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
      <div className="font-medium text-foreground">{text.pluginTitle}</div>
      <p className="text-[11px] leading-4 text-muted-foreground">
        {text.pluginHint}
      </p>
      <fieldset className="space-y-1 disabled:opacity-50" disabled={status.running}>
        <TextField
          label={text.simhubHost}
          value={simhubHost}
          onChange={onSimhubHost}
        />
        <NumberField
          label={text.simhubPort}
          max={65_535}
          min={1_024}
          step={1}
          value={simhubPort}
          onChange={onSimhubPort}
        />
        <NumberField
          label={text.listenPort}
          max={65_535}
          min={1_024}
          step={1}
          value={port}
          onChange={onPort}
        />
      </fieldset>
      <p className="text-[11px] leading-4 text-muted-foreground">
        {text.simhubHostHint}
      </p>
      {status.simhubAddress ? (
        <ReadOnlyField
          label={text.simhubAddress}
          value={status.simhubAddress}
        />
      ) : null}
      {status.sourceAddress ? (
        <ReadOnlyField label={text.source} value={status.sourceAddress} />
      ) : null}
    </div>
  )
}

function Measured({ status }: { status: TelemetryBridgeStatus }): React.JSX.Element {
  const { metrics } = status
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="font-medium text-foreground">{text.measured}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Quantiles label={text.addedLatency} value={metrics.handoff} />
        <Quantiles label={text.drainLatency} value={metrics.drain} />
        <ReadOnlyField
          label={text.lines}
          value={perSecond(metrics.linesPerSecond)}
        />
        <ReadOnlyField
          label={text.fields}
          value={perSecond(metrics.fieldsPerSecond)}
        />
        <ReadOnlyField
          label={text.bytes}
          value={perSecond(metrics.bytesPerSecond)}
        />
        <ReadOnlyField
          label={text.packets}
          value={perSecond(metrics.packetsPerSecond)}
        />
        <ReadOnlyField
          label={text.lostPackets}
          value={String(metrics.lostPackets)}
        />
        <ReadOnlyField
          label={text.dropped}
          value={`${metrics.droppedBytes} · ${metrics.writeErrors} ${text.writeErrors}`}
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
          ? text.noSamples
          : `p50 ${value.p50.toFixed(3)} · p95 ${value.p95.toFixed(3)} · p99 ${value.p99.toFixed(3)} · max ${value.max.toFixed(3)} ms`
      }
    />
  )
}

function perSecond(value: number): string {
  return `${Math.round(value)}${text.perSecond}`
}
