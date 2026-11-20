import type { TimeTransform, ValueTransform } from '../configuration-schema'
import { TELEMETRY_CATALOG, type TelemetryValueType } from '../telemetry-catalog'
import { MAXIMUM_TRANSFORM_DECIMALS } from '../value-transform'
import { t } from '../ui-text'

const FIELD_TYPES: ReadonlyMap<string, TelemetryValueType> = new Map(
  TELEMETRY_CATALOG.map(({ name, type }) => [name, type])
)

const READS: Record<NonNullable<TimeTransform['format']>, TelemetryValueType> = {
  duration_ms: 'uint32',
  clock_ms: 'uint32',
  signed_duration_ms: 'int32',
  compact_duration_ms: 'uint32',
  compact_clock_ms: 'uint32',
  signed_digits_ms: 'int32',
  split_ms: 'uint32'
}

export function transformError(
  transform: ValueTransform | undefined,
  binding: string,
  label: string,
  what: string
): string | undefined {
  const type = FIELD_TYPES.get(binding)
  if (type === undefined) return undefined
  const kind = transform?.type ?? 'none'
  if (kind === 'none') return undefined

  if (kind === 'time') {
    const format = transform?.format
    if (format === undefined || !(format in READS)) {
      return t('validation.transforms.whatOfLabelIsA', { what: what, label: label })
    }
    if (type === READS[format]) return undefined
    const counted = READS[format] === 'int32' ? t('validation.transforms.aSigned') : t('validation.transforms.anUnsigned')
    return t('validation.transforms.whatOfLabelTimesBinding', { what: what, label: label, binding: binding, type: type, _ms: format.replace('_ms', ''), counted: counted })
  }

  if (type === 'boolean') {
    return t('validation.transforms.whatOfLabelPutsA', { what: what, label: label, binding: binding })
  }
  const decimals = transform?.decimals ?? 0
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAXIMUM_TRANSFORM_DECIMALS) {
    return t('validation.transforms.whatOfLabelAsksFor', { what: what, label: label, decimals: decimals, mAXIMUM_TRANSFORM_DECIMALS: MAXIMUM_TRANSFORM_DECIMALS })
  }
  if (!Number.isFinite(transform?.scale ?? 1) || !Number.isFinite(transform?.offset ?? 0)) {
    return t('validation.transforms.whatOfLabelScalesBinding', { what: what, label: label, binding: binding })
  }
  return undefined
}
