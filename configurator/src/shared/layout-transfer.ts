import { childArraysOf, widgetsOf } from './configuration-access'
import { type ApplicationConfiguration, type WidgetConfiguration, type WidgetPlacement, type WidgetType } from './configuration-schema'
import { BOARD_PROFILES, type SimCoreBoardId } from './device'
import { MAXIMUM_FONT_SIZE_PX } from './font-assets'
import { fieldBounds } from './validate/ranges'

// Moving a dashboard to a board with a different display. Geometry is absolute
// logical pixels in one coordinate space, so the same document on a 320x170
// board and on a 1024x600 one is not the same document — every pixel-valued
// property has to be carried across.
//
// Two ways to land it, because the honest answer depends on the layout.
// `contain` is one uniform scale, min(destWidth/srcWidth, destHeight/srcHeight),
// centred in whatever space is left over: proportions survive, and a different
// aspect ratio leaves a margin showing the screen background. `stretch` scales
// each axis by its own ratio so the layout fills the display: nothing is wasted,
// and circles become ovals.
//
// A dashboard that is mostly boxes and readouts stretches well — a 1024x600
// race layout contained onto a 480x480 board wastes two fifths of the screen —
// while one built around a round gauge does not. So the choice is the author's
// rather than ours, and `contain` is the default because it cannot distort.
//
// Neither mode reflows: no widget is moved relative to its neighbours, and both
// scale a font by the smaller of the two ratios, since a glyph has one size.
//
// What this deliberately does not touch: colours of every kind, gradient
// direction, telemetry bindings and modifiers, a number transform's scale and
// offset (a unit conversion, not a pixel), value windows and thresholds, every
// duration in milliseconds, point_count, the arc's angles, recolor_opa,
// z_index, ids, actions, shape kind, orientation, slot triggers, and a screen's
// id and background colour.
//
// Pure: no React, no Electron, no device state. The renderer runs it for both
// entry points — converting the draft in place and applying a template authored
// for another board — so there is one rule rather than two.

export interface DisplaySize {
  width: number
  height: number
}

/**
 * `contain` keeps proportions and centres, leaving a margin on a display of a
 * different shape. `stretch` fills the display and distorts by the difference
 * between the two ratios.
 */
export type LayoutFit = 'contain' | 'stretch'

export const LAYOUT_FITS: readonly LayoutFit[] = ['contain', 'stretch']

export interface LayoutTransferTarget {
  board: SimCoreBoardId
  /**
   * Defaults to the board profile's display. A caller holding a live session
   * may pass the display the device itself reported instead.
   */
  display?: DisplaySize
  /** Defaults to `contain`, the mode that cannot distort. */
  fit?: LayoutFit
}

/**
 * One factor per axis, plus the one a value with no axis takes. A font size, a
 * corner radius and a ring thickness are single numbers, so they follow the
 * smaller ratio — scaling a glyph by the larger one would overflow the box that
 * grew by the smaller.
 */
interface Scale {
  x: number
  y: number
  min: number
}

export type LayoutTransferNoteKind =
  | 'image_resize_required'
  | 'field_clamped'
  | 'arc_thickness_reduced'
  | 'widget_off_display'

/**
 * One thing that did not carry across cleanly. Structured rather than phrased:
 * the wording belongs to whichever panel shows it, not to a shared module.
 */
export interface LayoutTransferNote {
  kind: LayoutTransferNoteKind
  screenIndex: number
  widgetId?: string
  widgetType?: WidgetType
  /** Dotted property path, for the two field kinds. */
  field?: string
  from?: number
  to?: number
  /** The asset an image widget draws, for image_resize_required. */
  imageId?: string
  /** The size that asset now has to be uploaded at. */
  size?: DisplaySize
}

export interface LayoutTransferResult {
  configuration: ApplicationConfiguration
  fit: LayoutFit
  scale: Scale
  offset: { x: number; y: number }
  from: DisplaySize
  to: DisplaySize
  notes: LayoutTransferNote[]
}

// A document that produced more notes than this has something systematically
// wrong with it, and the report groups them anyway.
const MAXIMUM_NOTES = 200

// The device's own default, which it applies to an arc that names no thickness
// — so a shrunk arc has to be repaired even when the property is absent.
const DEFAULT_ARC_THICKNESS_PX = 8

type PixelKind = 'int32' | 'int16' | 'uint16'

const KIND_BOUNDS: Record<PixelKind, { min: number; max: number }> = {
  int32: { min: -2147483648, max: 2147483647 },
  int16: { min: -32768, max: 32767 },
  uint16: { min: 0, max: 65535 }
}

interface PixelField {
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
const FRAME_PIXEL_FIELDS: readonly PixelField[] = [
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
const TYPE_PIXEL_FIELDS: Partial<Record<WidgetType, readonly PixelField[]>> = {
  text: [{ path: 'value.font.size_px', kind: 'uint16', minimum: 1, maximum: MAXIMUM_FONT_SIZE_PX }],
  arc: [{ path: 'thickness_px', kind: 'uint16', floorWhenPositive: true }],
  indicator: [
    { path: 'segment_gap_px', kind: 'uint16' },
    { path: 'segment_radius_px', kind: 'uint16' }
  ],
  graph: [{ path: 'line_width_px', kind: 'uint16', floorWhenPositive: true }]
}

/**
 * Moves a dashboard onto another board, scaling every pixel-valued property by
 * one factor. The input is never modified; the result carries the new document
 * and everything that did not survive the move intact.
 */
export function transferConfiguration(
  configuration: ApplicationConfiguration,
  target: LayoutTransferTarget
): LayoutTransferResult {
  // A JSON round trip rather than structuredClone, which preserves aliases: two
  // widgets sharing one font object would have its size scaled twice, once per
  // widget, and compound away to nothing. The document is JSON by definition —
  // it is serialized to reach the board — so this is lossless, and it is what
  // guarantees each field is scaled exactly once.
  const next = JSON.parse(JSON.stringify(configuration)) as ApplicationConfiguration
  const to = target.display ?? BOARD_PROFILES[target.board].display
  const from = BOARD_PROFILES[configuration.board]?.display ?? to
  next.board = target.board

  const fit = target.fit ?? 'contain'
  const notes: LayoutTransferNote[] = []
  // Same display means the same document. Applying a 480x480 template to a
  // 480x480 board rewrites the board identifier and nothing else, so a
  // round trip through here cannot quietly re-round a layout.
  if (from.width === to.width && from.height === to.height) {
    const unchanged = { x: 1, y: 1, min: 1 }
    return { configuration: next, fit, scale: unchanged, offset: { x: 0, y: 0 }, from, to, notes }
  }

  const ratio = { x: to.width / from.width, y: to.height / from.height }
  const uniform = Math.min(ratio.x, ratio.y)
  const scale: Scale =
    fit === 'stretch'
      ? { x: ratio.x, y: ratio.y, min: uniform }
      : { x: uniform, y: uniform, min: uniform }
  // Stretching fills the display by construction, so there is nothing to centre.
  const offset =
    fit === 'stretch'
      ? { x: 0, y: 0 }
      : {
          x: Math.floor((to.width - Math.round(from.width * scale.x)) / 2),
          y: Math.floor((to.height - Math.round(from.height * scale.y)) / 2)
        }

  const note = (entry: LayoutTransferNote): void => {
    if (notes.length < MAXIMUM_NOTES) notes.push(entry)
  }

  /**
   * One level of the widget tree. `origin` is where this level's parent sits on
   * the destination display, already scaled.
   *
   * The centring offset is added at depth 0 and nowhere else. A container's
   * children are stored relative to the container, whose own box has already
   * moved, so adding the offset again inside it would apply it twice.
   */
  const visit = (
    widgets: readonly WidgetConfiguration[],
    screenIndex: number,
    origin: { x: number; y: number },
    depth: number
  ): void => {
    for (const widget of widgets) {
      const before = placementSize(widget.placement)
      scalePlacement(widget.placement, scale, depth === 0 ? offset : NO_SHIFT)

      const box = widget.placement
      const absolute = { x: origin.x + (box?.x ?? 0), y: origin.y + (box?.y ?? 0) }
      const label = { screenIndex, widgetId: widget.id, widgetType: widget.type }

      // The same predicate structure.ts applies, and for the same reason: a
      // widget wholly off the display is the one geometry error the device
      // rejects the whole document over.
      if (box && isOffDisplay(absolute, box, to)) {
        note({ kind: 'widget_off_display', ...label })
      }

      for (const field of FRAME_PIXEL_FIELDS) scaleField(widget, field, scale, label, note)
      for (const field of TYPE_PIXEL_FIELDS[widget.type] ?? []) {
        scaleField(widget, field, scale, label, note)
      }
      repairArcThickness(widget, label, note)
      noteImageResize(widget, before, label, note)

      // Through childArraysOf so a container type added later is not a
      // forgotten `=== 'shape'` here.
      for (const children of childArraysOf(widget)) {
        visit(children, screenIndex, absolute, depth + 1)
      }
    }
  }

  const screens = next.dashboard?.screens ?? []
  for (let screenIndex = 0; screenIndex < screens.length; ++screenIndex) {
    const screen = screens[screenIndex]
    if (!screen) continue
    visit(widgetsOf(screen), screenIndex, { x: 0, y: 0 }, 0)
  }
  return { configuration: next, fit, scale, offset, from, to, notes }
}

const NO_SHIFT = { x: 0, y: 0 }

function isOffDisplay(
  absolute: { x: number; y: number },
  box: WidgetPlacement,
  display: DisplaySize
): boolean {
  const width = box.width ?? 0
  const height = box.height ?? 0
  return (
    absolute.x + width <= 0 ||
    absolute.y + height <= 0 ||
    absolute.x >= display.width ||
    absolute.y >= display.height
  )
}

/**
 * Scales a box by its edges rather than by its extent: the right edge is
 * scaled and the new width derived from it. Two widgets that shared an edge
 * still share it afterwards, and rounding does not accumulate along a row —
 * both of which a plain `round(width * scale)` loses.
 *
 * A width never rounds below one pixel, because the device rejects a document
 * holding a widget whose box has collapsed.
 */
function scalePlacement(
  placement: WidgetPlacement | undefined,
  scale: Scale,
  shift: { x: number; y: number }
): void {
  if (!placement) return
  scaleAxis(placement, 'x', 'width', scale.x, shift.x)
  scaleAxis(placement, 'y', 'height', scale.y, shift.y)
}

function scaleAxis(
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

function scaleField(
  widget: WidgetConfiguration,
  field: PixelField,
  scale: Scale,
  label: { screenIndex: number; widgetId?: string; widgetType: WidgetType },
  note: (entry: LayoutTransferNote) => void
): void {
  const leaf = leafOwner(widget, field.path)
  if (!leaf) return
  const value = leaf.owner[leaf.key]
  // Absent means the device applies its default, which is in range at any size.
  // A value that is not a number is findRangeError's to report, not ours.
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  const scaled = Math.round(value * (field.axis ? scale[field.axis] : scale.min))
  const floored = field.floorWhenPositive && value > 0 ? Math.max(1, scaled) : scaled
  const bounds = resolveBounds(label.widgetType, field)
  const next = clampInteger(floored, bounds.min, bounds.max)
  leaf.owner[leaf.key] = next
  if (next !== floored) {
    note({ kind: 'field_clamped', ...label, field: field.path, from: floored, to: next })
  }
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
function repairArcThickness(
  widget: WidgetConfiguration,
  label: { screenIndex: number; widgetId?: string; widgetType: WidgetType },
  note: (entry: LayoutTransferNote) => void
): void {
  if (widget.type !== 'arc') return
  const box = widget.placement
  const width = box?.width
  const height = box?.height
  if (typeof width !== 'number' || typeof height !== 'number') return
  const limit = Math.max(1, Math.floor(Math.min(width, height) / 2))
  const thickness = typeof widget.thickness_px === 'number'
    ? widget.thickness_px
    : DEFAULT_ARC_THICKNESS_PX
  if (thickness <= limit) return
  widget.thickness_px = limit
  note({ kind: 'arc_thickness_reduced', ...label, field: 'thickness_px', from: thickness, to: limit })
}

/**
 * The board draws an uploaded bitmap at the size it was uploaded at and never
 * scales it, so no geometric transform can carry an image asset along with the
 * layout. The widget's box is right after a transfer and its bitmap is not,
 * until it is converted and uploaded again at the size named here.
 */
function noteImageResize(
  widget: WidgetConfiguration,
  before: DisplaySize | undefined,
  label: { screenIndex: number; widgetId?: string; widgetType: WidgetType },
  note: (entry: LayoutTransferNote) => void
): void {
  if (widget.type !== 'image' || !widget.image) return
  const after = placementSize(widget.placement)
  if (!before || !after) return
  if (before.width === after.width && before.height === after.height) return
  note({ kind: 'image_resize_required', ...label, imageId: widget.image, size: after })
}

function placementSize(placement: WidgetPlacement | undefined): DisplaySize | undefined {
  const width = placement?.width
  const height = placement?.height
  if (typeof width !== 'number' || typeof height !== 'number') return undefined
  return { width, height }
}

/**
 * The object a dotted path's last step names, so a value can be written back
 * where it was read. Stops at the first gap, which is what keeps an absent
 * property absent rather than materializing the objects above it.
 */
function leafOwner(
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
function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}
