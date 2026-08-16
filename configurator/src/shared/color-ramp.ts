import type { ColorStop, RgbColor } from './configuration-schema'

// The device's colour ramp, mirrored so the preview can draw what the board
// will. Kept beside the schema rather than in the renderer because the preview
// is not the only thing that has to agree with the firmware about it.
//
// The firmware side is `conditions::ramp_color` in
// `firmware/platform/dashboard/conditions`: below the first stop and above the
// last one the ramp holds that stop's colour, and between two stops it
// interpolates each sRGB channel linearly.

export function rampColor(
  stops: readonly ColorStop[] | undefined,
  value: number | undefined
): RgbColor | undefined {
  if (!stops || stops.length < 2 || value === undefined || !Number.isFinite(value)) {
    return undefined
  }
  const anchors = stops.map((stop) => ({ at: stop.at ?? 0, color: stop.color }))
  const first = anchors[0]!
  const last = anchors[anchors.length - 1]!
  if (value <= first.at) return first.color
  if (value >= last.at) return last.color
  for (let index = 1; index < anchors.length; ++index) {
    const upper = anchors[index]!
    if (value > upper.at) continue
    const lower = anchors[index - 1]!
    const width = upper.at - lower.at
    // Stops are validated as increasing; this only guards a pair the validator
    // could not have seen, such as two stops at the same value.
    if (!(width > 0)) return lower.color
    return blend(lower.color, upper.color, (value - lower.at) / width)
  }
  return last.color
}

function blend(
  from: RgbColor | undefined,
  to: RgbColor | undefined,
  ratio: number
): RgbColor | undefined {
  const start = channels(from)
  const end = channels(to)
  if (!start || !end) return from ?? to
  const mixed = start.map((value, index) =>
    Math.round(value + ((end[index] ?? value) - value) * ratio)
  )
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}` as RgbColor
}

function channels(color: RgbColor | undefined): [number, number, number] | undefined {
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) return undefined
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16)
  ]
}
