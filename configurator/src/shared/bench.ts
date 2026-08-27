import type { DeviceResult } from './device'

export const BENCH_GET_STATUS_CHANNEL = 'bench:get-status' as const
export const BENCH_START_CHANNEL = 'bench:start' as const
export const BENCH_STOP_CHANNEL = 'bench:stop' as const
export const BENCH_UPDATE_CHANNEL = 'bench:update' as const
export const BENCH_APPLY_PATTERN_CHANNEL = 'bench:apply-pattern' as const
export const BENCH_RESTORE_CHANNEL = 'bench:restore' as const
export const BENCH_STATUS_CHANGED_CHANNEL = 'bench:status-changed' as const
export const BENCH_SAMPLE_CHANNEL = 'bench:sample' as const

export const MINIMUM_FEED_RATE_HZ = 10
export const MAXIMUM_FEED_RATE_HZ = 100
export const DEFAULT_FEED_RATE_HZ = 60
export const POLL_INTERVALS_MS = [100, 250, 500, 1_000, 2_000] as const
export const DEFAULT_POLL_INTERVAL_MS = 1_000

export type BenchPatternId = 'all_widgets' | 'full_screen_bar' | 'text_only'

export const BENCH_PATTERN_IDS: readonly BenchPatternId[] = [
  'all_widgets',
  'full_screen_bar',
  'text_only'
]

export const BENCH_PATTERN_LABELS: Record<BenchPatternId, string> = {
  all_widgets: 'All widgets',
  full_screen_bar: 'Full-screen bar',
  text_only: 'Text only'
}

export const BENCH_PATTERN_DESCRIPTIONS: Record<BenchPatternId, string> = {
  all_widgets:
    'Two or three of every widget type, including a nested container and two slots, each ' +
    'bound to a signal with its own frequency and amplitude.',
  full_screen_bar:
    'One bar over the whole display driven by a noisy signal — the largest area a single ' +
    'frame can repaint.',
  text_only: 'Eight text widgets at four sizes — glyph rasterization and value latency alone.'
}

export interface BenchStartRequest {
  rateHz: number
  pollIntervalMs: number
  signals?: string[]
}

export interface BenchUpdateRequest {
  rateHz?: number
  pollIntervalMs?: number
  signals?: string[]
}

export interface BenchPatternRequest {
  pattern: BenchPatternId
}

export interface BenchFeedStats {
  running: boolean
  rateHz: number
  measuredRateHz: number
  linesPerSecond: number
  bytesPerSecond: number
  signalCount: number
  droppedTicks: number
  writeErrors: number
  elapsedMs: number
}

export interface BenchDiagnostics {
  fps: number
  cpuCore0: number
  cpuCore1: number
  renderUs: number
  flushUs: number
  syncUs: number
  frameMaxUs: number
  workMaxUs: number
  gapMaxUs: number
  invalidatedPx: number
  invalidatedAreas: number
  drawnAreas: number
  latencyUs: number
  latencyMaxUs: number
  latencySamples: number
  internalTotal: number
  internalFree: number
  internalMinimum: number
  internalLargest: number
  psramTotal: number
  psramFree: number
  psramMinimum: number
  psramLargest: number
  stackLvgl: number
  stackTransport: number
  stackControl: number
  stackUpload: number
  stackSampler: number
  uptimeMs: number
}

export interface BenchSample {
  at: number
  roundTripMs: number
  feed: BenchFeedStats
  values: Record<string, number>
  diagnostics?: BenchDiagnostics
}

export type BenchDiagnosticsSupport = 'unknown' | 'supported' | 'unsupported'

export interface BenchStatus {
  feed: BenchFeedStats
  pollIntervalMs: number
  signals: string[]
  diagnostics: BenchDiagnosticsSupport
  pattern?: BenchPatternId
  patternStage?: string
  patternBusy: boolean
  message?: string
}

export type BenchResult<T> = DeviceResult<T>

export function clampFeedRate(rateHz: number): number {
  if (!Number.isFinite(rateHz)) return DEFAULT_FEED_RATE_HZ
  return Math.min(MAXIMUM_FEED_RATE_HZ, Math.max(MINIMUM_FEED_RATE_HZ, Math.round(rateHz)))
}

export function clampPollInterval(intervalMs: number): number {
  const nearest = POLL_INTERVALS_MS.reduce((best, candidate) =>
    Math.abs(candidate - intervalMs) < Math.abs(best - intervalMs) ? candidate : best
  )
  return Number.isFinite(intervalMs) ? nearest : DEFAULT_POLL_INTERVAL_MS
}

export function baudUtilization(bytesPerSecond: number, baudRate: number): number {
  if (!(baudRate > 0)) return 0
  return (bytesPerSecond * 10) / baudRate
}
