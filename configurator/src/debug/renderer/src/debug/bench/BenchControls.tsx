import { Play, RotateCcw, Square, Wand2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
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
} from '@debug-shared/bench'
import { useBenchStore } from './bench-store'

export function BenchControls(): React.JSX.Element {
  const connected = useDeviceStore((state) => state.status === 'connected')
  const status = useBenchStore((state) => state.status)
  const rateHz = useBenchStore((state) => state.rateHz)
  const pollIntervalMs = useBenchStore((state) => state.pollIntervalMs)
  const pattern = useBenchStore((state) => state.pattern)
  const enabled = useBenchStore((state) => state.enabled)
  const [working, setWorking] = useState(false)

  const running = status.active
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
    if (running) void window.pitrig.updateBench({ rateHz: next })
  }

  const changePoll = (next: number): void => {
    useBenchStore.getState().setPollInterval(next)
    if (running) void window.pitrig.updateBench({ pollIntervalMs: next })
  }

  return (
    <div className="flex min-w-0 flex-none items-center gap-2 overflow-x-auto rounded-lg border bg-card px-2.5 py-2">
      <Select<BenchPatternId>
        aria-label="Test pattern"
        className="w-40 flex-none"
        value={pattern}
        disabled={status.patternBusy}
        options={BENCH_PATTERN_IDS.map((id) => ({ value: id, label: BENCH_PATTERN_LABELS[id] }))}
        onChange={(next) => useBenchStore.getState().setPattern(next)}
      />
      <Button
        className="w-40 flex-none"
        disabled={!connected || status.patternBusy}
        onClick={() => void run(() => window.pitrig.applyBenchPattern({ pattern }))}
      >
        <Wand2 aria-hidden="true" className="mr-1.5 size-3.5" />
        {status.patternBusy ? (status.patternStage ?? 'Applying…') : 'Apply pattern'}
      </Button>
      <Button
        className="flex-none"
        variant="outline"
        disabled={!connected || status.patternBusy || status.pattern === undefined}
        onClick={() => void run(() => window.pitrig.restoreBenchDashboard())}
      >
        <RotateCcw aria-hidden="true" className="mr-1.5 size-3.5" />
        Restore
      </Button>

      <div className="mx-1 h-6 w-px flex-none bg-border" />

      <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
        Rate
        <input
          aria-label="Telemetry rate"
          className="h-8 min-w-24 flex-1 accent-sky-400"
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
              ? window.pitrig.stopBench()
              : window.pitrig.startBench({ rateHz, pollIntervalMs, signals: enabled })
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

      <Select<number>
        aria-label="Diagnostics interval"
        className="w-28 flex-none"
        value={pollIntervalMs}
        options={POLL_INTERVALS_MS.map((interval) => ({ value: interval, label: `Poll ${interval} ms` }))}
        onChange={changePoll}
      />
    </div>
  )
}
