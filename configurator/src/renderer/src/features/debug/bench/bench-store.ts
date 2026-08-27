import { create } from 'zustand'

import {
  DEFAULT_FEED_RATE_HZ,
  DEFAULT_POLL_INTERVAL_MS,
  type BenchPatternId,
  type BenchSample,
  type BenchStatus
} from '@shared/bench'
import { BENCH_SIGNAL_IDS } from '@shared/bench-signals'

export const MAXIMUM_BENCH_SAMPLES = 900

const EMPTY_STATUS: BenchStatus = {
  active: false,
  feed: {
    running: false,
    rateHz: DEFAULT_FEED_RATE_HZ,
    measuredRateHz: 0,
    linesPerSecond: 0,
    bytesPerSecond: 0,
    signalCount: BENCH_SIGNAL_IDS.length,
    droppedTicks: 0,
    writeErrors: 0,
    elapsedMs: 0
  },
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  signals: [...BENCH_SIGNAL_IDS],
  diagnostics: 'unknown',
  patternBusy: false
}

interface BenchStore {
  status: BenchStatus
  samples: BenchSample[]
  rateHz: number
  pollIntervalMs: number
  pattern: BenchPatternId
  enabled: string[]
  error?: string
  applyStatus: (status: BenchStatus) => void
  appendSample: (sample: BenchSample) => void
  setRate: (rateHz: number) => void
  setPollInterval: (pollIntervalMs: number) => void
  setPattern: (pattern: BenchPatternId) => void
  toggleSignal: (id: string) => void
  setError: (error?: string) => void
}

export const useBenchStore = create<BenchStore>((set) => ({
  status: EMPTY_STATUS,
  samples: [],
  rateHz: DEFAULT_FEED_RATE_HZ,
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  pattern: 'all_widgets',
  enabled: [...BENCH_SIGNAL_IDS],
  applyStatus: (status) => set({ status }),
  appendSample: (sample) =>
    set((current) => {
      const samples = [...current.samples, sample]
      return {
        samples:
          samples.length > MAXIMUM_BENCH_SAMPLES
            ? samples.slice(samples.length - MAXIMUM_BENCH_SAMPLES)
            : samples
      }
    }),
  setRate: (rateHz) => set({ rateHz }),
  setPollInterval: (pollIntervalMs) => set({ pollIntervalMs }),
  setPattern: (pattern) => set({ pattern }),
  toggleSignal: (id) =>
    set((current) => {
      const enabled = current.enabled.includes(id)
        ? current.enabled.filter((entry) => entry !== id)
        : [...current.enabled, id]
      return { enabled: enabled.length === 0 ? current.enabled : enabled }
    }),
  setError: (error) => set({ error })
}))

export function subscribeToBench(): () => void {
  const stopStatus = window.simcore.onBenchStatus((status) =>
    useBenchStore.getState().applyStatus(status)
  )
  const stopSamples = window.simcore.onBenchSample((sample) =>
    useBenchStore.getState().appendSample(sample)
  )
  void window.simcore.getBenchStatus().then((status) => useBenchStore.getState().applyStatus(status))
  return () => {
    stopStatus()
    stopSamples()
  }
}
