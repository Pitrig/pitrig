import type { TelemetryCatalogEntry } from './telemetry-catalog'

export const MAXIMUM_TRANSFORM_DECIMALS = 4

export interface UnitPreset {
  label: string
  units: readonly string[]
  bindings?: readonly string[]
  scale: number
  offset: number
  suffix: string
}

export const UNIT_PRESETS: readonly UnitPreset[] = [
  {
    label: 'km/h → mph',
    units: [],
    bindings: ['vehicle.speed'],
    scale: 0.621371,
    offset: 0,
    suffix: ' mph'
  },
  { label: 'm/s → km/h', units: ['meter_per_second'], scale: 3.6, offset: 0, suffix: ' km/h' },
  { label: 'm/s → mph', units: ['meter_per_second'], scale: 2.236936, offset: 0, suffix: ' mph' },
  { label: '°C → °F', units: ['celsius'], scale: 1.8, offset: 32, suffix: '°F' },
  { label: 'kPa → bar', units: ['kilopascal'], scale: 0.01, offset: 0, suffix: ' bar' },
  { label: 'kPa → psi', units: ['kilopascal'], scale: 0.145038, offset: 0, suffix: ' psi' },
  { label: 'L → gal', units: ['liter'], scale: 0.264172, offset: 0, suffix: ' gal' },
  {
    label: 'rpm → thousands',
    units: ['rpm'],
    bindings: ['engine.rpm'],
    scale: 0.001,
    offset: 0,
    suffix: 'k'
  }
]

export function unitPresetsFor(
  binding: TelemetryCatalogEntry | undefined
): readonly UnitPreset[] {
  if (!binding) return []
  return UNIT_PRESETS.filter(
    (preset) =>
      preset.units.includes(binding.unit) || (preset.bindings?.includes(binding.name) ?? false)
  )
}
