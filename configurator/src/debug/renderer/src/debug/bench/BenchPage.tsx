import { PageShell } from '@/app/workspace/PageShell'
import type { BenchDiagnostics, BenchSample } from '@debug-shared/bench'
import { BENCH_PATTERN_DESCRIPTIONS } from '@debug-shared/bench'
import { BenchChart } from './BenchChart'
import { BenchControls } from './BenchControls'
import { BenchTables } from './BenchTables'
import { useBenchStore } from './bench-store'

const COLORS = {
  cyan: '#22d3ee',
  emerald: '#34d399',
  amber: '#f59e0b',
  rose: '#fb7185',
  violet: '#a78bfa'
} as const

export function BenchPage(): React.JSX.Element {
  const samples = useBenchStore((state) => state.samples)
  const status = useBenchStore((state) => state.status)
  const pattern = useBenchStore((state) => state.pattern)
  const error = useBenchStore((state) => state.error)
  const latest = samples.at(-1)
  const note = error ?? status.message
  const feedTimes = samples.map((sample) => sample.at)
  const diagnosticTimes = samples
    .filter((sample) => sample.diagnostics !== undefined)
    .map((sample) => sample.at)

  return (
    <PageShell
      title="Bench"
      description={BENCH_PATTERN_DESCRIPTIONS[pattern]}
      fill
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
        <BenchControls />
        {note ? (
          <p
            className={`flex-none truncate rounded-md border px-2.5 py-1 text-[11px] ${
              error ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'text-muted-foreground'
            }`}
          >
            {note}
          </p>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-2">
          <BenchChart
            title="Frames per second"
            reference={60}
            minimum={0}
            times={diagnosticTimes}
            series={[{ label: 'fps', color: COLORS.cyan, points: pick(samples, (d) => d.fps) }]}
          />
          <BenchChart
            title="Frame time (ms)"
            minimum={0}
            times={diagnosticTimes}
            format={(value) => value.toFixed(1)}
            series={[
              { label: 'render', color: COLORS.cyan, points: pick(samples, (d) => d.renderUs / 1_000) },
              { label: 'flush', color: COLORS.amber, points: pick(samples, (d) => d.flushUs / 1_000) },
              { label: 'sync', color: COLORS.violet, points: pick(samples, (d) => d.syncUs / 1_000) }
            ]}
          />
          <BenchChart
            title="Value latency (ms)"
            minimum={0}
            times={diagnosticTimes}
            format={(value) => value.toFixed(1)}
            series={[
              { label: 'avg', color: COLORS.emerald, points: pick(samples, (d) => d.latencyUs / 1_000) },
              { label: 'max', color: COLORS.rose, points: pick(samples, (d) => d.latencyMaxUs / 1_000) }
            ]}
          />
          <BenchChart
            title="CPU (%)"
            minimum={0}
            maximum={100}
            times={diagnosticTimes}
            series={[
              { label: 'core 0', color: COLORS.cyan, points: pick(samples, (d) => d.cpuCore0) },
              { label: 'core 1', color: COLORS.amber, points: pick(samples, (d) => d.cpuCore1) }
            ]}
          />
          <BenchChart
            title="Telemetry rate (Hz)"
            minimum={0}
            times={feedTimes}
            reference={status.feed.rateHz}
            format={(value) => value.toFixed(0)}
            series={[
              {
                label: 'sent',
                color: COLORS.emerald,
                points: samples.map((sample) => sample.feed.measuredRateHz)
              }
            ]}
          />
          <BenchChart
            title="Invalidated pixels"
            minimum={0}
            times={diagnosticTimes}
            format={(value) => (value >= 1_000 ? `${(value / 1_000).toFixed(0)}k` : value.toFixed(0))}
            series={[
              { label: 'px', color: COLORS.violet, points: pick(samples, (d) => d.invalidatedPx) }
            ]}
          />
          <BenchChart
            title="Areas per second"
            minimum={0}
            times={diagnosticTimes}
            series={[
              {
                label: 'invalidated',
                color: COLORS.amber,
                points: pick(samples, (d) => d.invalidatedAreas)
              },
              { label: 'drawn', color: COLORS.cyan, points: pick(samples, (d) => d.drawnAreas) }
            ]}
          />
          <BenchChart
            title="Free memory (KiB)"
            minimum={0}
            times={diagnosticTimes}
            series={[
              {
                label: 'internal',
                color: COLORS.emerald,
                points: pick(samples, (d) => d.internalFree / 1_024)
              },
              {
                label: 'psram',
                color: COLORS.violet,
                points: pick(samples, (d) => d.psramFree / 1_024)
              }
            ]}
          />
        </div>

        <BenchTables status={status} {...(latest ? { latest } : {})} />
      </div>
    </PageShell>
  )
}

function pick(
  samples: readonly BenchSample[],
  read: (diagnostics: BenchDiagnostics) => number
): number[] {
  const points: number[] = []
  for (const sample of samples) {
    if (sample.diagnostics) points.push(read(sample.diagnostics))
  }
  return points
}
