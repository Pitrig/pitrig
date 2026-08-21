import {
  type FontSpec,
  type WidgetConfiguration,
  type WidgetPlacement
} from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { documentFonts } from '@shared/document-fonts'
import { DEFAULT_FONT_FAMILY } from '@shared/font-assets'

// What a brand-new widget starts as: the per-type factory literals, the sizes
// they are created at, and the font a new reading should inherit from the
// dashboard around it. The insertion machinery that places these lives in
// widgets.ts.

// The device rasterizes any size from an installed family, so a new widget
// picks a readable size rather than inheriting one that happens to be installed.
export const DEFAULT_WIDGET_FONT_SIZE_PX = 24
// A caption labels a widget rather than competing with it, so it does not
// inherit the reading's size.
export const DEFAULT_CAPTION_FONT_SIZE_PX = 16

/** The value that occurs most often, ties going to the one seen first. */
function commonest<T>(values: readonly T[]): T | undefined {
  const tally = new Map<T, number>()
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1)
  let best: T | undefined
  let bestCount = 0
  for (const [value, count] of tally) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

function draftFonts(configuration: DeviceConfiguration | undefined): FontSpec[] {
  return documentFonts(configuration).filter((font): font is FontSpec => font !== undefined)
}

/**
 * The family a new widget should take. The author's chosen dashboard font wins;
 * failing that, the family the dashboard already draws with, because a new
 * widget in some other family stands out for no reason the author asked for and
 * — since the device holds one face per family — also adds a family to the
 * upload. The bundled default is the floor, so a widget is never created
 * without a font, which the device rejects the whole document over.
 *
 * What is installed on a connected board deliberately plays no part. The
 * library decides what can be authored; the board only says what has been
 * delivered so far, and seeding from it would put a family the library cannot
 * resolve into a brand-new widget.
 */
export function draftFontFamily(
  configuration: DeviceConfiguration | undefined,
  preferredFamily?: string
): string {
  const families = draftFonts(configuration)
    .map((font) => font.family)
    .filter((family): family is string => Boolean(family))
  return preferredFamily ?? commonest(families) ?? DEFAULT_FONT_FAMILY
}

/**
 * The font a new reading should take: the dashboard's family at the size its
 * other readings already use, so a widget added beside them matches them.
 */
export function draftValueFont(
  configuration: DeviceConfiguration | undefined,
  preferredFamily?: string
): FontSpec {
  const family = draftFontFamily(configuration, preferredFamily)
  const sizes = draftFonts(configuration)
    .filter((font) => font.family === family)
    .map((font) => font.size_px)
    .filter((size): size is number => typeof size === 'number' && size > 0)
  return { family, size_px: commonest(sizes) ?? DEFAULT_WIDGET_FONT_SIZE_PX }
}

// A widget with no font is rejected by the device as a whole-document error,
// so a newly added one adopts an installed family when the board has any.
// Without fonts installed it is created bare and the validator explains why.
/**
 * What a new widget of each type starts as. Eight near-identical factories used
 * to wrap these literals, each one a twelve-line `let added;
 * mutateDraftConfiguration(...); return added` differing only in what it put
 * inside. Adding a widget type is one entry here now, rather than a new
 * function plus a new button handler.
 *
 * `extras` carries what the editor knows and a type may want: the family the
 * dashboard already draws with, and an image that is actually installed.
 */
/**
 * The box a new widget of each type is created at. Named rather than written
 * into the factories below, because the inspector's "reset size" has to return
 * a widget to it: the schema's own default is a zero-sized box, which the
 * editor reads as no placement at all and stops drawing.
 */
/**
 * What a graph reads before the author has chosen. It is also what a trace
 * added to an existing graph starts from: the contract's own default for a
 * source is the empty string, which the device refuses, so a trace the panel
 * writes has to name a field or adding one would break a working dashboard
 * until the author noticed.
 */
export const NEW_GRAPH_BINDING = 'vehicle.speed'

export const NEW_WIDGET_SIZE: Record<
  WidgetConfiguration['type'],
  { width: number; height: number }
> = {
  text: { width: 120, height: 64 },
  shape: { width: 160, height: 80 },
  slot: { width: 200, height: 100 },
  bar: { width: 200, height: 24 },
  arc: { width: 120, height: 120 },
  indicator: { width: 240, height: 20 },
  image: { width: 96, height: 96 },
  graph: { width: 200, height: 80 }
}

export interface NewWidgetExtras {
  font?: FontSpec
  image?: string
  /**
   * The box the author drew, in display coordinates. Absent means the widget is
   * centred, which is what a toolbar button with no pointer behind it can mean.
   */
  placement?: Required<WidgetPlacement>
  /**
   * Where it was drawn: a container's id, or `screen` for a box the pointer put
   * outside every container. Absent leaves the choice to the editor's own rule
   * — the container being worked in, or the selected one.
   *
   * A drawn box always answers this, because what the author drew is where they
   * meant it: falling back to the opened container would put a widget somewhere
   * other than under the rectangle they just dragged.
   */
  into?: string | 'screen'
}

export const WIDGET_DEFAULTS: Record<
  WidgetConfiguration['type'],
  (
    display: { width: number; height: number },
    extras: NewWidgetExtras
  ) => WidgetConfiguration
> = {
  text: (display, { font }) => ({
    type: 'text',
    // A text widget renders its sources, so it always has at least one. The
    // empty source takes the schema default binding.
    sources: [{}],
    ...(font ? { value: { font } } : {}),
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.text)
  }),
  shape: (display) => ({
    type: 'shape',
    // A shape with nothing painted would be invisible, so it starts as a
    // visible plate the author can restyle.
    background_color: '#1E293B',
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.shape)
  }),
  slot: (display) => ({
    type: 'slot',
    pages: [{}, {}],
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.slot)
  }),
  bar: (display) => ({
    type: 'bar',
    // The frame background is the track the fill runs over, so a new bar
    // starts with one; the default 0..1 window suits a normalized source.
    background_color: '#1E293B',
    source: { binding: 'vehicle.throttle' },
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.bar)
  }),
  arc: (display) => ({
    type: 'arc',
    source: { binding: 'engine.rpm_percent' },
    // A visible track is what makes an empty gauge read as a gauge.
    track_color: '#1E293B',
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.arc)
  }),
  indicator: (display) => ({
    type: 'indicator',
    source: { binding: 'engine.rpm_percent' },
    off_color: '#1E293B',
    // The shift-light ladder every rev strip starts from: green, amber, red.
    segments: [
      { threshold: 0.5, color: '#00C853' },
      { threshold: 0.62, color: '#00C853' },
      { threshold: 0.74, color: '#FFD200' },
      { threshold: 0.84, color: '#FFD200' },
      { threshold: 0.92, color: '#D50000' },
      { threshold: 0.97, color: '#D50000' }
    ],
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.indicator)
  }),
  image: (display, { image }) => ({
    type: 'image',
    // The device draws an image at the size it was uploaded at, so a new
    // widget starts at that size when one is installed.
    ...(image ? { image } : {}),
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.image)
  }),
  graph: (display) => ({
    type: 'graph',
    source: { binding: NEW_GRAPH_BINDING },
    background_color: '#1E293B',
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.graph)
  }),
}


export function centeredPlacement(
  display: { width: number; height: number },
  preferred: { width: number; height: number }
): WidgetPlacement {
  const width = Math.min(preferred.width, display.width)
  const height = Math.min(preferred.height, display.height)
  return {
    x: Math.floor((display.width - width) / 2),
    y: Math.floor((display.height - height) / 2),
    width,
    height
  }
}
