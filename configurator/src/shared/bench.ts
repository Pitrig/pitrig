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
export const MAXIMUM_FEED_RATE_HZ = 120
export const DEFAULT_FEED_RATE_HZ = 60
export const POLL_INTERVALS_MS = [100, 250, 500, 1_000, 2_000] as const
export const DEFAULT_POLL_INTERVAL_MS = 1_000

export const BENCH_PATTERN_IDS = [
  'all_widgets',
  'full_screen_bar',
  'text_only',
  'text_16',
  'text_32',
  'text_64',
  'text_32_plain',
  'text_32_shapes',
  'shapes_96',
  'huge_text_4',
  'bars_24',
  'arcs_12',
  'graphs_6',
  'sprites_24',
  'indicators_12',
  'nested_containers'
] as const

export type BenchPatternId = (typeof BENCH_PATTERN_IDS)[number]

export const BENCH_PATTERN_LABELS: Record<BenchPatternId, string> = {
  all_widgets: 'All widgets',
  full_screen_bar: 'Full-screen bar',
  text_only: 'Text only',
  text_16: 'Text grid 16',
  text_32: 'Text grid 32',
  text_64: 'Text grid 64',
  text_32_plain: 'Text grid 32, no border',
  text_32_shapes: 'Text 32 over 96 shapes',
  shapes_96: '96 static shapes',
  huge_text_4: 'Four huge readouts',
  bars_24: 'Bars 24',
  arcs_12: 'Arcs 12',
  graphs_6: 'Graphs 6',
  sprites_24: 'Sprites 24',
  indicators_12: 'Indicators 12',
  nested_containers: 'Containers 8 x 4'
}

export const BENCH_PATTERN_DESCRIPTIONS: Record<BenchPatternId, string> = {
  all_widgets:
    'Two or three of every widget type, including a nested container and two slots, each ' +
    'bound to a signal with its own frequency and amplitude.',
  full_screen_bar:
    'One bar over the whole display driven by a noisy signal — the largest area a single ' +
    'frame can repaint.',
  text_only: 'Eight text widgets at four sizes — glyph rasterization and value latency alone.',
  text_16: 'Sixteen readouts that all change every frame — the shape of an ordinary dashboard.',
  text_32: 'Thirty-two readouts changing every frame — twice the areas a frame has to draw.',
  text_64: 'Sixty-four readouts changing every frame — past what any board holds at 60 fps.',
  text_32_plain:
    'The thirty-two grid without borders or corner radius, so every fill is square and ' +
    'opaque — what the ESP32-P4 accelerator can take.',
  text_32_shapes:
    'The thirty-two grid over ninety-six static shapes — the object-tree walk every drawn ' +
    'area pays, separated from the drawing itself.',
  shapes_96:
    'Ninety-six static shapes and one changing readout — the walk alone, with almost nothing ' +
    'to draw.',
  huge_text_4:
    'Four readouts at a quarter of the display height — pixel cost rather than per-area cost.',
  bars_24: 'Twenty-four bars, half of them vertical, a third gradient-filled.',
  arcs_12: 'Twelve arcs — drawing through a mask, which no accelerator takes.',
  graphs_6: 'Six two-trace graphs at the contract maximum — line drawing over the whole screen.',
  sprites_24: 'Twenty-four sprite frames picked from telemetry — the image blit path.',
  indicators_12: 'Twelve segmented indicators at the contract maximum, blinking near the top.',
  nested_containers: 'Eight clipping containers of four readouts each — nesting and clipping.'
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
  active: boolean
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
