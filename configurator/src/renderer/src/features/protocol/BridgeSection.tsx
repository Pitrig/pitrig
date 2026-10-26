import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageSection, ReadOnlyField } from '@/app/workspace/PageShell'
import { NumberField, TextField } from '@/features/configuration/inspector/fields'
import {
  setBridgeRequest,
  startTelemetryBridge,
  useBridgeStore
} from '@/features/telemetry/bridge-store'
import type {
  LatencyQuantiles,
  PluginStatus,
  TelemetryBridgeStatus
} from '@shared/telemetry-bridge'
import { t } from '@shared/ui-text'

export function BridgeSection(): React.JSX.Element {
  const status = useBridgeStore((state) => state.status)
  const busy = useBridgeStore((state) => state.busy)
  const request = useBridgeStore((state) => state.request)
  const [error, setError] = useState<string>()

  const apply = async (): Promise<void> => {
    setError(await startTelemetryBridge(request))
  }

  return (
    <PageSection
      title={t('protocol.bridgeSection.title')}
      description={t('protocol.bridgeSection.description')}
    >
      <div className="space-y-3">
        <StateChips status={status} />
        <PluginBoards plugin={status.plugin} />
        <PluginSource
          busy={busy}
          port={request.port}
          simhubHost={request.simhubHost}
          simhubPort={request.simhubPort}
          status={status}
          onApply={() => void apply()}
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
  const relay = status.suspended
    ? t('protocol.bridgeSection.suspended')
    : status.relaying
      ? t('protocol.bridgeSection.relaying')
      : t('protocol.bridgeSection.previewOnly')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={status.plugin ? 'default' : 'outline'}>
        {status.plugin
          ? t('protocol.bridgeSection.pluginVersion', { version: status.plugin.version })
          : t('protocol.bridgeSection.pluginMissing')}
      </Badge>
      {status.running ? (
        <Badge variant="outline">
          {status.receiving
            ? t('protocol.bridgeSection.receiving')
            : t('protocol.bridgeSection.waiting')}
        </Badge>
      ) : null}
      {status.running ? <Badge variant="outline">{relay}</Badge> : null}
    </div>
  )
}

function PluginBoards({ plugin }: { plugin: PluginStatus | undefined }): React.JSX.Element {
  if (!plugin) {
    return (
      <p className="text-[11px] leading-4 text-muted-foreground">
        {t('protocol.bridgeSection.pluginHint')}
      </p>
    )
  }
  return (
    <div className="space-y-1 rounded-md border bg-muted/20 p-3">
      <div className="font-medium text-foreground">{t('protocol.bridgeSection.boardsTitle')}</div>
      {plugin.boards.length === 0 ? (
        <p className="text-muted-foreground">{t('protocol.bridgeSection.noBoards')}</p>
      ) : (
        plugin.boards.map((board) => (
          <p key={board.path} className="font-mono text-muted-foreground">
            {board.board.length > 0 ? `${board.path} · ${board.board}` : board.path}
          </p>
        ))
      )}
      {plugin.busy.map((path) => (
        <p key={path} className="text-amber-200">
          {t('protocol.bridgeSection.portBusy', { path })}
        </p>
      ))}
    </div>
  )
}

function PluginSource({
  busy,
  port,
  simhubHost,
  simhubPort,
  status,
  onApply
}: {
  busy: boolean
  port: number
  simhubHost: string
  simhubPort: number
  status: TelemetryBridgeStatus
  onApply: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="font-medium text-foreground">{t('protocol.bridgeSection.connection')}</div>
      <fieldset className="space-y-1 disabled:opacity-50" disabled={busy}>
        <TextField
          label={t('protocol.bridgeSection.simhubHost')}
          value={simhubHost}
          onChange={(value) => setBridgeRequest({ simhubHost: value })}
        />
        <NumberField
          label={t('protocol.bridgeSection.simhubPort')}
          max={65_535}
          min={1_024}
          step={1}
          value={simhubPort}
          onChange={(value) => setBridgeRequest({ simhubPort: value })}
        />
        <NumberField
          label={t('protocol.bridgeSection.listenPort')}
          max={65_535}
          min={1_024}
          step={1}
          value={port}
          onChange={(value) => setBridgeRequest({ port: value })}
        />
      </fieldset>
      <p className="text-[11px] leading-4 text-muted-foreground">
        {t('protocol.bridgeSection.simhubHostHint')}
      </p>
      <Button disabled={busy} variant="outline" onClick={onApply}>
        {busy ? t('protocol.bridgeSection.applying') : t('protocol.bridgeSection.apply')}
      </Button>
      {status.simhubAddress ? (
        <ReadOnlyField label={t('protocol.bridgeSection.asking')} value={status.simhubAddress} />
      ) : null}
      {status.sourceAddress ? (
        <ReadOnlyField label={t('protocol.bridgeSection.sending')} value={status.sourceAddress} />
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
          value={t('protocol.bridgeSection.droppedValue', {
            bytes: metrics.droppedBytes,
            errors: metrics.writeErrors
          })}
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
  return t('protocol.bridgeSection.perSecond', { value: Math.round(value) })
}
