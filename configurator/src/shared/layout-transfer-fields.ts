import {
  type WidgetConfiguration,
  type WidgetPlacement,
  type WidgetType
} from './configuration-schema'
import { MAXIMUM_FONT_SIZE_PX } from './font-assets'
import { fieldBounds } from './validate/ranges'
import type { Scale } from './layout-transfer'

export type PixelKind = 'int32' | 'int16' | 'uint16'

export const KIND_BOUNDS: Record<PixelKind, { min: number; max: number }> = {
  int32: { min: -2147483648, max: 2147483647 },
  int16: { min: -32768, max: 32767 },
  uint16: { min: 0, max: 65535 }
}

export interface PixelField {
  path: string
  kind: PixelKind
  axis?: 'x' | 'y'
  floorWhenPositive?: boolean
  minimum?: number
  maximum?: number
}

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
  if (hasStart || shift !== 0) {
    placement[origin] = clampInteger(scaledNear + shift, KIND_BOUNDS.int32.min, KIND_BOUNDS.int32.max)
  }
  if (hasSize) {
    placement[extent] = Math.max(1, Math.round(far * scale) - scaledNear)
  }
}

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
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  const scaled = Math.round(value * (field.axis ? scale[field.axis] : scale.min))
  const floored = field.floorWhenPositive && value > 0 ? Math.max(1, scaled) : scaled
  const bounds = resolveBounds(widget.type, field)
  const next = clampInteger(floored, bounds.min, bounds.max)
  leaf.owner[leaf.key] = next
  if (next !== floored) clamped?.(field, floored, next)
}

function resolveBounds(owner: WidgetType, field: PixelField): { min: number; max: number } {
  const kind = KIND_BOUNDS[field.kind]
  const declared = fieldBounds(owner, field.path)
  return {
    min: Math.max(kind.min, field.minimum ?? -Infinity, declared.min ?? -Infinity),
    max: Math.min(kind.max, field.maximum ?? Infinity, declared.max ?? Infinity)
  }
}

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

export function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}
