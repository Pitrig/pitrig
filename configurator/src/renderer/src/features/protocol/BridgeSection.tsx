import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageSection, ReadOnlyField } from '@/app/workspace/PageShell'
import { SelectField } from '@/features/configuration/inspector/fields'
import {
  startTelemetryBridge,
  stopTelemetryBridge,
  useBridgeStore
} from '@/features/telemetry/bridge-store'
import {
  SUPPORTED_BAUD_RATES,
  type DeviceResult,
  type SerialPortSummary
} from '@shared/device'
import {
  HOSTED_MAXIMUM_BAUD_RATE,
  type LatencyQuantiles,
  type TelemetryBridgeStatus
} from '@shared/telemetry-bridge'
import { t } from '@shared/ui-text'

const DEFAULT_SOURCE_BAUD_RATE = 115_200

export function BridgeSection(): React.JSX.Element {
  const status = useBridgeStore((state) => state.status)
  const busy = useBridgeStore((state) => state.busy)
  const [ports, setPorts] = useState<readonly SerialPortSummary[]>([])
  const [portPath, setPortPath] = useState('')
  const [baudRate, setBaudRate] = useState(String(DEFAULT_SOURCE_BAUD_RATE))
  const [error, setError] = useState<string>()

  const applyPorts = useCallback((result: DeviceResult<SerialPortSummary[]>): void => {
    if (!result.ok) return
    setPorts(result.value)
    setPortPath((current) => current || (result.value[0]?.path ?? ''))
  }, [])

  useEffect(() => {
    if (status.hostingSupported) return
    void window.pitrig.listSerialPorts().then(applyPorts)
  }, [applyPorts, status.hostingSupported])

  const start = async (): Promise<void> => {
    setError(undefined)
    const portId = ports.find((port) => port.path === portPath)?.id ?? ''
    const failure = await startTelemetryBridge(
      status.hostingSupported
        ? { mode: 'hosted' }
        : { mode: 'port', portId, baudRate: Number(baudRate) }
    )
    setError(failure)
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
          <Button
            disabled={busy || (!status.hostingSupported && !portPath)}
            onClick={() => void start()}
          >
            {busy ? t('protocol.bridgeSection.starting') : t('protocol.bridgeSection.start')}
          </Button>
        )
      }
    >
      <div className="space-y-3">
        <StateChips status={status} />
        {status.hostingSupported ? (
          <HostedSource status={status} />
        ) : (
          <PairedSource
            baudRate={baudRate}
            ports={ports}
            portPath={portPath}
            running={status.running}
            onBaudRate={setBaudRate}
            onPortPath={setPortPath}
            onRefresh={() => void window.pitrig.listSerialPorts().then(applyPorts)}
          />
        )}
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

function HostedSource({ status }: { status: TelemetryBridgeStatus }): React.JSX.Element {
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="font-medium text-foreground">{t('protocol.bridgeSection.hostedTitle')}</div>
      <p className="text-[11px] leading-4 text-muted-foreground">
        {t('protocol.bridgeSection.hostedHint', { maximum: HOSTED_MAXIMUM_BAUD_RATE })}
      </p>
      {status.listenPath ? (
        <ReadOnlyField
          label={t('protocol.bridgeSection.listenPath')}
          value={status.listenPath}
        />
      ) : null}
    </div>
  )
}

function PairedSource({
  ports,
  portPath,
  baudRate,
  running,
  onPortPath,
  onBaudRate,
  onRefresh
}: {
  ports: readonly SerialPortSummary[]
  portPath: string
  baudRate: string
  running: boolean
  onPortPath: (value: string) => void
  onBaudRate: (value: string) => void
  onRefresh: () => void
}): React.JSX.Element {
  const windows = navigator.userAgent.includes('Windows')
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">
          {t('protocol.bridgeSection.pairedTitleWindows')}
        </span>
        <Button disabled={running} variant="outline" onClick={onRefresh}>
          {t('protocol.bridgeSection.refresh')}
        </Button>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">
        {windows
          ? t('protocol.bridgeSection.pairedHintWindows')
          : t('protocol.bridgeSection.pairedHintLinux')}
      </p>
      {ports.length === 0 ? (
        <p className="text-muted-foreground">{t('protocol.bridgeSection.noPorts')}</p>
      ) : (
        <fieldset className="space-y-1 disabled:opacity-50" disabled={running}>
          <SelectField
            label={t('protocol.bridgeSection.sourcePort')}
            value={portPath}
            options={ports.map((port) => port.path)}
            onChange={onPortPath}
          />
          <SelectField
            label={t('protocol.bridgeSection.speed')}
            value={baudRate}
            options={SUPPORTED_BAUD_RATES.map(String)}
            onChange={onBaudRate}
          />
        </fieldset>
      )}
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
