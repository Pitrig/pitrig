import type { TextSourceConfiguration, ValueTransform } from './configuration-schema'
import type { TelemetryCatalogEntry } from './telemetry-catalog'
import { t } from './ui-text'

export const MAXIMUM_TRANSFORM_DECIMALS = 4

export interface UnitPreset {
  label: string
  units: readonly string[]
  bindings?: readonly string[]
  scale: number
  offset: number
  suffix: string
  decimals?: number
  defaultCategories?: readonly string[]
}

const UNIT_PRESETS: readonly UnitPreset[] = [
  { label: 'km/h', units: [], bindings: ['vehicle.speed'], scale: 1, offset: 0, suffix: ' km/h' },
  { label: 'mph', units: [], bindings: ['vehicle.speed'], scale: 0.621371, offset: 0, suffix: ' mph' },
  { label: 'm/s', units: ['meter_per_second'], scale: 1, offset: 0, suffix: ' m/s' },
  { label: 'km/h', units: ['meter_per_second'], scale: 3.6, offset: 0, suffix: ' km/h' },
  { label: 'mph', units: ['meter_per_second'], scale: 2.236936, offset: 0, suffix: ' mph' },
  { label: '°C', units: ['celsius'], scale: 1, offset: 0, suffix: '°C' },
  { label: '°F', units: ['celsius'], scale: 1.8, offset: 32, suffix: '°F' },
  { label: 'kPa', units: ['kilopascal'], scale: 1, offset: 0, suffix: ' kPa', decimals: 0 },
  { label: 'bar', units: ['kilopascal'], scale: 0.01, offset: 0, suffix: ' bar', decimals: 2 },
  {
    label: 'psi',
    units: ['kilopascal'],
    scale: 0.145038,
    offset: 0,
    suffix: ' psi',
    decimals: 1,
    defaultCategories: ['tyres']
  },
  { label: 'L', units: ['liter'], scale: 1, offset: 0, suffix: ' L' },
  { label: 'gal', units: ['liter'], scale: 0.264172, offset: 0, suffix: ' gal' },
  { label: 'rpm', units: ['rpm'], bindings: ['engine.rpm'], scale: 1, offset: 0, suffix: '' },
  {
    label: t('misc.valueTransform.rpmThousands'),
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

export function defaultUnit(binding: TelemetryCatalogEntry | undefined): UnitPreset | undefined {
  if (!binding) return undefined
  return unitPresetsFor(binding).find((preset) => preset.defaultCategories?.includes(binding.category))
}

export function selectedUnit(
  presets: readonly UnitPreset[],
  transform: ValueTransform | undefined
): UnitPreset | undefined {
  const number = transform?.type === 'number'
  const scale = number ? (transform.scale ?? 1) : 1
  const offset = number ? (transform.offset ?? 0) : 0
  return presets.find((preset) => preset.scale === scale && preset.offset === offset)
}

export function applyUnit(
  source: TextSourceConfiguration,
  unit: UnitPreset,
  previous: UnitPreset | undefined
): void {
  const transform = source.transform ?? {}
  if (transform.type !== 'number') {
    transform.type = 'number'
    delete transform.format
  }
  if (unit.scale === 1) delete transform.scale
  else transform.scale = unit.scale
  if (unit.offset === 0) delete transform.offset
  else transform.offset = unit.offset
  if (unit.decimals !== undefined) transform.decimals = unit.decimals
  if (previous && transform.suffix && transform.suffix === previous.suffix) transform.suffix = unit.suffix
  source.transform = transform
}
