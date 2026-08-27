import type { BenchSample } from '@shared/bench'

const DIAGNOSTIC_COLUMNS = [
  'fps',
  'cpuCore0',
  'cpuCore1',
  'renderUs',
  'flushUs',
  'syncUs',
  'frameMaxUs',
  'workMaxUs',
  'gapMaxUs',
  'invalidatedPx',
  'invalidatedAreas',
  'drawnAreas',
  'latencyUs',
  'latencyMaxUs',
  'latencySamples',
  'internalFree',
  'internalMinimum',
  'psramFree',
  'psramMinimum',
  'uptimeMs'
] as const

export function benchSamplesToCsv(samples: readonly BenchSample[]): string {
  const header = [
    'at',
    'roundTripMs',
    'rateHz',
    'measuredRateHz',
    'linesPerSecond',
    'bytesPerSecond',
    'droppedTicks',
    ...DIAGNOSTIC_COLUMNS
  ]
  const rows = samples.map((sample) =>
    [
      new Date(sample.at).toISOString(),
      sample.roundTripMs.toFixed(1),
      sample.feed.rateHz,
      sample.feed.measuredRateHz.toFixed(2),
      sample.feed.linesPerSecond.toFixed(1),
      sample.feed.bytesPerSecond.toFixed(0),
      sample.feed.droppedTicks,
      ...DIAGNOSTIC_COLUMNS.map((column) => sample.diagnostics?.[column] ?? '')
    ].join(',')
  )
  return [header.join(','), ...rows].join('\n')
}
