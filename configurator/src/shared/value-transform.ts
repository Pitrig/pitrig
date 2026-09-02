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
}

const UNIT_PRESETS: readonly UnitPreset[] = [
  {
    label: t('misc.valueTransform.kmHMph'),
    units: [],
    bindings: ['vehicle.speed'],
    scale: 0.621371,
    offset: 0,
    suffix: ' mph'
  },
  { label: t('misc.valueTransform.mSKmH'), units: ['meter_per_second'], scale: 3.6, offset: 0, suffix: ' km/h' },
  { label: t('misc.valueTransform.mSMph'), units: ['meter_per_second'], scale: 2.236936, offset: 0, suffix: ' mph' },
  { label: '°C → °F', units: ['celsius'], scale: 1.8, offset: 32, suffix: '°F' },
  { label: t('misc.valueTransform.kPaBar'), units: ['kilopascal'], scale: 0.01, offset: 0, suffix: ' bar' },
  { label: t('misc.valueTransform.kPaPsi'), units: ['kilopascal'], scale: 0.145038, offset: 0, suffix: ' psi' },
  { label: t('misc.valueTransform.lGal'), units: ['liter'], scale: 0.264172, offset: 0, suffix: ' gal' },
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
