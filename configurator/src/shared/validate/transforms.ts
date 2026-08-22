import type { ValueTransform } from '../configuration-schema'
import { TELEMETRY_CATALOG, type TelemetryValueType } from '../telemetry-catalog'
import { MAXIMUM_TRANSFORM_DECIMALS } from '../value-transform'

// Whether a transform suits the field it is put on.
//
// This mirrors `valid_transform` in the firmware's `value_rules.cpp`, which the
// device applies before it will take a document at all. Without it here the
// author picks "time" on a speed reading, the editor says nothing, and the
// board answers the save with a malformed-property error naming `transform` —
// no widget, no field, nothing to act on.
//
// The rule is about what a transform can be handed. A duration is a whole
// number of milliseconds counted from zero, so it reads an unsigned integer and
// a delta reads a signed one; neither can be made out of a float, a string or a
// flag. A number transform will scale anything except a true/false, which has
// no magnitude to scale.

const FIELD_TYPES: ReadonlyMap<string, TelemetryValueType> = new Map(
  TELEMETRY_CATALOG.map(({ name, type }) => [name, type])
)

const READS: Record<'duration_ms' | 'signed_duration_ms', TelemetryValueType> = {
  duration_ms: 'uint32',
  signed_duration_ms: 'int32'
}

/**
 * The transform on one text source, against the field that source reads.
 *
 * An unresolvable binding is not this check's business — the binding rule has
 * already named it — so a field the catalog does not know passes here.
 */
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
    if (format !== 'duration_ms' && format !== 'signed_duration_ms') {
      return `${what} of ${label} is a time transform with no format; the device needs "duration_ms" or "signed_duration_ms".`
    }
    if (type === READS[format]) return undefined
    const counted = format === 'signed_duration_ms' ? 'a signed' : 'an unsigned'
    return `${what} of ${label} times "${binding}", which the device carries as ${type}; a ${format.replace('_ms', '')} is ${counted} whole number of milliseconds.`
  }

  if (type === 'boolean') {
    return `${what} of ${label} puts a number transform on "${binding}", which is true or false and has nothing to scale.`
  }
  const decimals = transform?.decimals ?? 0
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAXIMUM_TRANSFORM_DECIMALS) {
    return `${what} of ${label} asks for ${decimals} decimals; the device writes at most ${MAXIMUM_TRANSFORM_DECIMALS}.`
  }
  if (!Number.isFinite(transform?.scale ?? 1) || !Number.isFinite(transform?.offset ?? 0)) {
    return `${what} of ${label} scales "${binding}" by something that is not a finite number.`
  }
  return undefined
}
