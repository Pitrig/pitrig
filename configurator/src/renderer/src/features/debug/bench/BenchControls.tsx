import { Copy, Eraser, Play, RotateCcw, Square, Wand2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { useDeviceStore } from '@/features/device/device-store'
import {
  BENCH_PATTERN_IDS,
  BENCH_PATTERN_LABELS,
  MAXIMUM_FEED_RATE_HZ,
  MINIMUM_FEED_RATE_HZ,
  POLL_INTERVALS_MS,
  type BenchPatternId,
  type BenchResult,
  type BenchStatus
} from '@shared/bench'
import { benchSamplesToCsv } from './bench-csv'
import { useBenchStore } from './bench-store'

export function BenchControls(): React.JSX.Element {
  const connected = useDeviceStore((state) => state.status === 'connected')
  const status = useBenchStore((state) => state.status)
  const rateHz = useBenchStore((state) => state.rateHz)
  const pollIntervalMs = useBenchStore((state) => state.pollIntervalMs)
  const pattern = useBenchStore((state) => state.pattern)
  const enabled = useBenchStore((state) => state.enabled)
  const samples = useBenchStore((state) => state.samples)
  const [working, setWorking] = useState(false)

  const running = status.feed.running
  const run = async (work: () => Promise<BenchResult<BenchStatus>>): Promise<void> => {
    setWorking(true)
    try {
      const result = await work()
      useBenchStore.getState().setError(result.ok ? undefined : result.error.message)
      if (result.ok) useBenchStore.getState().applyStatus(result.value)
    } finally {
      setWorking(false)
    }
  }

  const changeRate = (next: number): void => {
    useBenchStore.getState().setRate(next)
    if (running) void window.simcore.updateBench({ rateHz: next })
  }

  const changePoll = (next: number): void => {
    useBenchStore.getState().setPollInterval(next)
    if (running) void window.simcore.updateBench({ pollIntervalMs: next })
  }

  return (
    <div className="flex flex-none flex-wrap items-center gap-2 rounded-lg border bg-card px-2.5 py-2">
      <select
        aria-label="Test pattern"
        className="h-8 w-40 flex-none rounded-md border bg-background px-2 text-xs"
        value={pattern}
        disabled={status.patternBusy}
        onChange={(event) =>
          useBenchStore.getState().setPattern(event.target.value as BenchPatternId)
        }
      >
        {BENCH_PATTERN_IDS.map((id) => (
          <option key={id} value={id}>
            {BENCH_PATTERN_LABELS[id]}
          </option>
        ))}
      </select>
      <Button
        className="flex-none"
        disabled={!connected || status.patternBusy}
        onClick={() => void run(() => window.simcore.applyBenchPattern({ pattern }))}
      >
        <Wand2 aria-hidden="true" className="mr-1.5 size-3.5" />
        {status.patternBusy ? 'Applying…' : 'Apply pattern'}
      </Button>
      <Button
        className="flex-none"
        variant="outline"
        disabled={!connected || status.patternBusy || status.pattern === undefined}
        onClick={() => void run(() => window.simcore.restoreBenchDashboard())}
      >
        <RotateCcw aria-hidden="true" className="mr-1.5 size-3.5" />
        Restore
      </Button>

      <div className="mx-1 h-6 w-px flex-none bg-border" />

      <label className="flex flex-none items-center gap-2 text-xs text-muted-foreground">
        Rate
        <input
          aria-label="Telemetry rate"
          className="h-8 w-36 accent-sky-400"
          type="range"
          min={MINIMUM_FEED_RATE_HZ}
          max={MAXIMUM_FEED_RATE_HZ}
          step={5}
          value={rateHz}
          onChange={(event) => changeRate(Number(event.target.value))}
        />
        <span className="w-14 flex-none text-right font-mono text-foreground">{rateHz} Hz</span>
      </label>

      <Button
        className="w-24 flex-none"
        disabled={!connected || working}
        onClick={() =>
          void run(() =>
            running
              ? window.simcore.stopBench()
              : window.simcore.startBench({ rateHz, pollIntervalMs, signals: enabled })
          )
        }
      >
        {running ? (
          <Square aria-hidden="true" className="mr-1.5 size-3.5" />
        ) : (
          <Play aria-hidden="true" className="mr-1.5 size-3.5" />
        )}
        {running ? 'Stop' : 'Start'}
      </Button>

      <select
        aria-label="Diagnostics interval"
        className="h-8 w-28 flex-none rounded-md border bg-background px-2 text-xs"
        value={pollIntervalMs}
        onChange={(event) => changePoll(Number(event.target.value))}
      >
        {POLL_INTERVALS_MS.map((interval) => (
          <option key={interval} value={interval}>
            Poll {interval} ms
          </option>
        ))}
      </select>

      <div className="ml-auto flex flex-none items-center gap-2">
        <Button
          variant="outline"
          disabled={samples.length === 0}
          onClick={() => void navigator.clipboard.writeText(benchSamplesToCsv(samples))}
        >
          <Copy aria-hidden="true" className="mr-1.5 size-3.5" />
          CSV
        </Button>
        <Button
          variant="outline"
          disabled={samples.length === 0}
          onClick={() => useBenchStore.getState().clearSamples()}
        >
          <Eraser aria-hidden="true" className="mr-1.5 size-3.5" />
          Clear
        </Button>
      </div>
    </div>
  )
}
