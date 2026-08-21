import {
  type WidgetConfiguration,
  type WidgetPlacement,
  type WidgetType
} from './configuration-schema'
import { MAXIMUM_FONT_SIZE_PX } from './font-assets'
import { fieldBounds } from './validate/ranges'
import type { Scale } from './layout-transfer'

// The pixel-valued properties a transfer scales, and the arithmetic that
// scales one of them: the tables name every field the contract measures in
// pixels, and the walk in layout-transfer.ts applies them. A property added to
// the frame is one line in a table here instead of eight switches.

export type PixelKind = 'int32' | 'int16' | 'uint16'

export const KIND_BOUNDS: Record<PixelKind, { min: number; max: number }> = {
  int32: { min: -2147483648, max: 2147483647 },
  int16: { min: -32768, max: 32767 },
  uint16: { min: 0, max: 65535 }
}

export interface PixelField {
  /** Dotted path from the widget object. */
  path: string
  /** The integer the contract declares, which is the widest window a value may take. */
  kind: PixelKind
  /**
   * Which factor this follows when the two axes differ. Only a directional gap
   * has one: everything else is a single number with no axis to belong to, and
   * takes the smaller ratio so it cannot outgrow the box around it. Under
   * `contain` all three factors are equal and this makes no difference.
   */
  axis?: 'x' | 'y'
  /** Keeps a line or ring the author set above zero from scaling away to nothing. */
  floorWhenPositive?: boolean
  /** Only where the schema is not the authority — a font size is bounded by the asset pipeline. */
  minimum?: number
  maximum?: number
}

/**
 * Carried by every widget type, through the frame each one flattens. A table
 * rather than a switch per type, for the same reason childArraysOf and
 * documentFonts are tables: a property added to the frame is one line here
 * instead of eight.
 */
export const FRAME_PIXEL_FIELDS: readonly PixelField[] = [
  { path: 'padding.left', kind: 'uint16', axis: 'x' },
  { path: 'padding.top', kind: 'uint16', axis: 'y' },
  { path: 'padding.right', kind: 'uint16', axis: 'x' },
  { path: 'padding.bottom', kind: 'uint16', axis: 'y' },
  { path: 'border.width_px', kind: 'uint16', floorWhenPositive: true },
  { path: 'border.radius_px', kind: 'uint16' },
  { path: 'title.offset_x_px', kind: 'int16', axis: 'x' },
  { path: 'title.offset_y_px', kind: 'int16', axis: 'y' },
  { path: 'title.gap_padding_px', kind: 'uint16' },
  { path: 'title.font.size_px', kind: 'uint16', minimum: 1, maximum: MAXIMUM_FONT_SIZE_PX },
  { path: 'background_inset_px', kind: 'uint16' }
]

/**
 * Owned by one widget type. A type absent from this table has no pixel geometry
 * of its own beyond its frame — and a type added later that does have some has
 * to be listed here, which is what this comment is for.
 */
export const TYPE_PIXEL_FIELDS: Partial<Record<WidgetType, readonly PixelField[]>> = {
  text: [{ path: 'value.font.size_px', kind: 'uint16', minimum: 1, maximum: MAXIMUM_FONT_SIZE_PX }],
  arc: [{ path: 'thickness_px', kind: 'uint16', floorWhenPositive: true }],
  indicator: [
    { path: 'segment_gap_px', kind: 'uint16' },
    { path: 'segment_radius_px', kind: 'uint16' }
  ],
  graph: [{ path: 'line_width_px', kind: 'uint16', floorWhenPositive: true }]
}

export function scaleAxis(
  placement: WidgetPlacement,
  origin: 'x' | 'y',
  extent: 'width' | 'height',
  scale: number,
  shift: number
): void {
  const start = placement[origin]
  const size = placement[extent]
  const hasStart = typeof start === 'number' && Number.isFinite(start)
  const hasSize = typeof size === 'number' && Number.isFinite(size)
  const near = hasStart ? start : 0
  const far = near + (hasSize ? size : 0)
  const scaledNear = Math.round(near * scale)
  // An absent coordinate reads as zero, which the centring still has to move,
  // so the offset materializes it rather than leaving the widget at the edge.
  if (hasStart || shift !== 0) {
    placement[origin] = clampInteger(scaledNear + shift, KIND_BOUNDS.int32.min, KIND_BOUNDS.int32.max)
  }
  if (hasSize) {
    placement[extent] = Math.max(1, Math.round(far * scale) - scaledNear)
  }
}

/**
 * Every pixel-valued property one widget owns, scaled in place. `clamped` is
 * called for a value the contract would not take at the new size, which is the
 * transfer's business to report and the editor's to ignore.
 */
export function scaleWidgetFields(
  widget: WidgetConfiguration,
  scale: Scale,
  clamped?: (field: PixelField, from: number, to: number) => void
): void {
  for (const field of FRAME_PIXEL_FIELDS) scaleField(widget, field, scale, clamped)
  for (const field of TYPE_PIXEL_FIELDS[widget.type] ?? []) {
    scaleField(widget, field, scale, clamped)
  }
}

function scaleField(
  widget: WidgetConfiguration,
  field: PixelField,
  scale: Scale,
  clamped?: (field: PixelField, from: number, to: number) => void
): void {
  const leaf = leafOwner(widget, field.path)
  if (!leaf) return
  const value = leaf.owner[leaf.key]
  // Absent means the device applies its default, which is in range at any size.
  // A value that is not a number is findRangeError's to report, not ours.
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  const scaled = Math.round(value * (field.axis ? scale[field.axis] : scale.min))
  const floored = field.floorWhenPositive && value > 0 ? Math.max(1, scaled) : scaled
  const bounds = resolveBounds(widget.type, field)
  const next = clampInteger(floored, bounds.min, bounds.max)
  leaf.owner[leaf.key] = next
  if (next !== floored) clamped?.(field, floored, next)
}

/**
 * The narrowest of three windows: the integer the contract declares, the range
 * the generated table states, and the field's own rule. FIELD_RANGES covers
 * only some of these properties — it has nothing for padding, the title offsets
 * or the indicator's gaps — so the declared kind is what keeps an inset from
 * going negative, and the table is what keeps a scaled radius under 480.
 */
function resolveBounds(owner: WidgetType, field: PixelField): { min: number; max: number } {
  const kind = KIND_BOUNDS[field.kind]
  const declared = fieldBounds(owner, field.path)
  return {
    min: Math.max(kind.min, field.minimum ?? -Infinity, declared.min ?? -Infinity),
    max: Math.min(kind.max, field.maximum ?? Infinity, declared.max ?? Infinity)
  }
}

/**
 * Two ring thicknesses have to fit across an arc or the ring closes into a
 * disc, which the firmware rejects as invalid_widget. The configurator's own
 * validator does not check this, so a shrunk arc would otherwise pass here and
 * fail on the board. The default counts: an arc naming no thickness still gets
 * the device's 8.
 */

export function leafOwner(
  source: unknown,
  path: string
): { owner: Record<string, unknown>; key: string } | undefined {
  const steps = path.split('.')
  const key = steps.pop()
  if (key === undefined) return undefined
  let value: unknown = source
  for (const step of steps) {
    if (typeof value !== 'object' || value === null) return undefined
    value = (value as Record<string, unknown>)[step]
  }
  if (typeof value !== 'object' || value === null) return undefined
  return { owner: value as Record<string, unknown>, key }
}

// The editor's clamp lives in the renderer, which a shared module must not
// reach into, and this one rounds nothing — every caller has rounded already.
export function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}
