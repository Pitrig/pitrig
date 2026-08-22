import { childArraysOf, widgetsOf } from './configuration-access'
import { type ApplicationConfiguration, type WidgetConfiguration, type WidgetPlacement, type WidgetType } from './configuration-schema'
import { BOARD_PROFILES, type SimCoreBoardId } from './device'
import { scaleAxis, scaleWidgetFields } from './layout-transfer-fields'
import { repairArcThickness, repairFrameInset } from './layout-transfer-repairs'

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
// duration in milliseconds, point_count, the arc's angles, recolor_opa, an
// image's sprite frame (an index into an asset, not a measurement),
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
export interface Scale {
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

      scaleWidgetFields(widget, scale, (field, from, to) => {
        note({ kind: 'field_clamped', ...label, field: field.path, from, to })
      })
      repairArcThickness(widget, (from, to) => {
        note({ kind: 'arc_thickness_reduced', ...label, field: 'thickness_px', from, to })
      })
      repairFrameInset(widget, (field, from, to) => {
        note({ kind: 'field_clamped', ...label, field, from, to })
      })
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

/**
 * Resizing a container carries its contents, when the author asks for it.
 *
 * The widget's own box is the caller's — it is what the drag resolved — and
 * everything the box holds follows it here: each child's placement, and every
 * pixel-valued property of the widget and its descendants, so a plate that is
 * dragged twice as wide keeps the same proportions rather than becoming a
 * bigger frame around the same small text.
 *
 * The same tables the board transfer uses, and for the same reason: a property
 * added to the frame has to scale in both places or in neither, and one table
 * is how that stays true. What differs is only the reporting — a transfer says
 * what it clamped, a resize is an edit the author is watching happen.
 */
export function scaleWidgetPixels(widget: WidgetConfiguration, scale: Scale): void {
  scaleWidgetFields(widget, scale)
  repairArcThickness(widget)
  repairFrameInset(widget)
  // Through childArraysOf, so a container type added later is not a forgotten
  // `=== 'shape'` here either.
  for (const children of childArraysOf(widget)) {
    for (const child of children) {
      scalePlacement(child.placement, scale, NO_SHIFT)
      scaleWidgetPixels(child, scale)
    }
  }
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
