import { useDeviceStore } from '@/features/device/device-store'
import { baudUtilization, type BenchSample, type BenchStatus } from '@shared/bench'
import { BENCH_SIGNALS } from '@shared/bench-signals'
import { useBenchStore } from './bench-store'

interface BenchTablesProps {
  status: BenchStatus
  latest?: BenchSample
}

export function BenchTables({ status, latest }: BenchTablesProps): React.JSX.Element {
  const connection = useDeviceStore((state) => state.connection)
  const session = useDeviceStore((state) => state.session)
  const enabled = useBenchStore((state) => state.enabled)
  const toggleSignal = useBenchStore((state) => state.toggleSignal)
  const running = status.feed.running

  const display = session?.info.display
  const feed = latest?.feed ?? status.feed
  const utilization = connection ? baudUtilization(feed.bytesPerSecond, connection.baudRate) : 0
  const diagnostics = latest?.diagnostics

  return (
    <div className="grid h-44 flex-none grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)] gap-2">
      <Panel title="Link and feed">
        <Row label="Board" value={session ? session.info.boardId : 'not connected'} />
        <Row
          label="Display"
          value={display ? `${display.width}×${display.height}` : '—'}
        />
        <Row
          label="Port"
          value={connection ? `${connection.displayName} @ ${connection.baudRate}` : '—'}
        />
        <Row
          label="Rate"
          value={`${status.feed.rateHz} Hz asked · ${feed.measuredRateHz.toFixed(1)} Hz sent`}
          warn={running && feed.measuredRateHz < status.feed.rateHz * 0.9}
        />
        <Row
          label="Throughput"
          value={`${feed.linesPerSecond.toFixed(0)} lines/s · ${bytes(
            feed.bytesPerSecond
          )}/s · ${(utilization * 100).toFixed(0)}% of baud`}
          warn={utilization > 0.7}
        />
        <Row
          label="Dropped"
          value={`${feed.droppedTicks} ticks · ${feed.writeErrors} write errors`}
          warn={feed.droppedTicks > 0 || feed.writeErrors > 0}
        />
        <Row
          label="Diagnostics"
          value={
            status.diagnostics === 'supported'
              ? `debug build · ${latest ? `${latest.roundTripMs.toFixed(0)} ms round trip` : 'waiting'}`
              : status.diagnostics === 'unsupported'
                ? 'product build — no @SC:DIAG'
                : 'unknown until the first poll'
          }
          warn={status.diagnostics === 'unsupported'}
        />
      </Panel>

      <Panel title="Memory, stacks and worst case">
        <Row
          label="Internal"
          value={
            diagnostics
              ? `${bytes(diagnostics.internalFree)} free · ${bytes(diagnostics.internalMinimum)} low · ${bytes(diagnostics.internalLargest)} block`
              : '—'
          }
        />
        <Row
          label="PSRAM"
          value={
            diagnostics
              ? `${bytes(diagnostics.psramFree)} free · ${bytes(diagnostics.psramMinimum)} low · ${bytes(diagnostics.psramLargest)} block`
              : '—'
          }
        />
        <Row
          label="Stacks"
          value={
            diagnostics
              ? `lvgl ${bytes(diagnostics.stackLvgl)} · link ${bytes(diagnostics.stackTransport)} · ctl ${bytes(diagnostics.stackControl)}`
              : '—'
          }
          warn={Boolean(diagnostics && diagnostics.stackLvgl < 1_024)}
        />
        <Row
          label="Frame max"
          value={
            diagnostics
              ? `${ms(diagnostics.frameMaxUs)} frame · ${ms(diagnostics.workMaxUs)} work · ${ms(diagnostics.gapMaxUs)} gap`
              : '—'
          }
        />
        <Row
          label="Latency max"
          value={diagnostics ? `${ms(diagnostics.latencyMaxUs)} over ${diagnostics.latencySamples} values` : '—'}
        />
        <Row
          label="Areas"
          value={
            diagnostics
              ? `${diagnostics.invalidatedAreas} invalidated · ${diagnostics.drawnAreas} drawn · ${diagnostics.invalidatedPx.toLocaleString()} px`
              : '—'
          }
        />
        <Row label="Uptime" value={diagnostics ? `${(diagnostics.uptimeMs / 1_000).toFixed(0)} s` : '—'} />
      </Panel>

      <Panel title={`Signals — ${enabled.length} of ${BENCH_SIGNALS.length} fed`}>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {BENCH_SIGNALS.map((signal) => {
            const active = enabled.includes(signal.id)
            const value = latest?.values[signal.id]
            return (
              <button
                key={signal.id}
                type="button"
                className={`flex items-baseline justify-between gap-1 rounded px-1 text-left transition-colors hover:bg-muted ${
                  active ? 'text-foreground' : 'text-muted-foreground/50 line-through'
                }`}
                onClick={() => {
                  toggleSignal(signal.id)
                  const next = useBenchStore.getState().enabled
                  if (status.feed.running) void window.simcore.updateBench({ signals: next })
                }}
              >
                <span className="truncate">{signal.label}</span>
                <span className="flex-none font-mono text-[10px]">
                  {value === undefined ? '—' : value.toFixed(signal.decimals)}
                </span>
              </button>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card">
      <h3 className="flex-none truncate border-b px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        {title}
      </h3>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-hidden px-2.5 py-1.5 text-[11px]">
        {children}
      </div>
    </section>
  )
}

function Row({
  label,
  value,
  warn
}: {
  label: string
  value: string
  warn?: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="flex-none text-muted-foreground">{label}</span>
      <span
        className={`truncate text-right font-mono ${warn ? 'text-amber-400' : 'text-foreground'}`}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}

function bytes(value: number): string {
  if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)}M`
  if (value >= 1_024) return `${(value / 1_024).toFixed(0)}K`
  return `${Math.round(value)}B`
}

function ms(microseconds: number): string {
  return `${(microseconds / 1_000).toFixed(1)} ms`
}
