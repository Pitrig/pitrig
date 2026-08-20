import { allWidgetsOf, createWidgetId, isContainer, pagesOf } from '@shared/configuration-access'
import { type FontSpec, MAXIMUM_ACTIONS, MAXIMUM_ARC_WIDGETS, MAXIMUM_NESTING_DEPTH, MAXIMUM_BAR_WIDGETS, MAXIMUM_GRAPH_WIDGETS, MAXIMUM_IMAGE_WIDGETS, MAXIMUM_INDICATOR_WIDGETS, MAXIMUM_SHAPE_WIDGETS, MAXIMUM_SLOT_WIDGETS, MAXIMUM_TEXT_WIDGETS, MAXIMUM_WIDGETS_PER_CONTAINER, MAXIMUM_WIDGETS_PER_SCREEN, type WidgetConfiguration, type WidgetPlacement } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { applyFontFamily, documentFonts } from '@shared/document-fonts'
import { DEFAULT_FONT_FAMILY } from '@shared/font-assets'
import { absolutePlacement, ancestorsOf, completePlacement, findWidget, mutateDraftConfiguration, parentContainerId, parentOf, widgetArrayOf } from './document'
import { visibleSlotPage } from '../preview/canvas-geometry'
import { ensureScreen } from './screens'
import { useDashboardEditorStore, type WidgetSelection } from './store'

const WIDGET_CAPACITIES: Record<WidgetConfiguration['type'], number> = {
  text: MAXIMUM_TEXT_WIDGETS,
  shape: MAXIMUM_SHAPE_WIDGETS,
  bar: MAXIMUM_BAR_WIDGETS,
  arc: MAXIMUM_ARC_WIDGETS,
  indicator: MAXIMUM_INDICATOR_WIDGETS,
  graph: MAXIMUM_GRAPH_WIDGETS,
  image: MAXIMUM_IMAGE_WIDGETS,
  slot: MAXIMUM_SLOT_WIDGETS
}

interface InsertionTarget {
  widgets: WidgetConfiguration[]
  cap: number
  /** Where this array measures its children from, absent on a screen. */
  box?: Required<WidgetPlacement>
  /** How many containers stand above the array, which bounds what may join it. */
  depth: number
}

/** One container's own array: a shape's, or the page of a slot being looked at. */
function containerTarget(
  configuration: DeviceConfiguration,
  containerId: string
): InsertionTarget | undefined {
  const location = findWidget(configuration, containerId)
  const container = location?.widget
  if (!location || !container) return undefined
  // Absolute, not the authored box: a nested container's placement is read
  // against its own parent, so using it directly would land a widget as far off
  // as the whole chain above it.
  const box = absolutePlacement(configuration, containerId)
  const depth = ancestorsOf(configuration, location).length + 1
  if (container.type === 'shape') {
    return { widgets: (container.widgets ??= []), cap: MAXIMUM_WIDGETS_PER_CONTAINER, box, depth }
  }
  if (container.type !== 'slot') return undefined
  const page = pagesOf(container)[visibleSlotPage(container, useDashboardEditorStore.getState().slotPage)]
  return page
    ? { widgets: (page.widgets ??= []), cap: MAXIMUM_WIDGETS_PER_CONTAINER, box, depth }
    : undefined
}

/**
 * Where a new widget lands: the container being worked in, and the active
 * screen otherwise. "Being worked in" is the one that has been opened, or
 * failing that the selected container — adding a widget while a panel is
 * selected means adding it to the panel, which is what every editor with
 * containers does and what saves a trip through the layer panel afterwards.
 * A widget *inside* a container is deliberately not enough: the selection would
 * then decide parenting from something the author only clicked.
 */
function insertionTarget(configuration: DeviceConfiguration): InsertionTarget | undefined {
  const { drillIn, selection } = useDashboardEditorStore.getState()
  const opened = drillIn ? containerTarget(configuration, drillIn) : undefined
  if (opened) return opened
  const picked =
    selection?.type === 'widget' && isContainerId(configuration, selection.id)
      ? containerTarget(configuration, selection.id)
      : undefined
  if (picked) return picked
  return screenTarget(configuration)
}

/** The active screen's own array, which is where a widget with no container goes. */
function screenTarget(configuration: DeviceConfiguration): InsertionTarget {
  const screen = ensureScreen(configuration)
  return { widgets: (screen.widgets ??= []), cap: MAXIMUM_WIDGETS_PER_SCREEN, depth: 0 }
}

function isContainerId(configuration: DeviceConfiguration, id: string): boolean {
  const widget = findWidget(configuration, id)?.widget
  return widget !== undefined && isContainer(widget)
}

/**
 * A display-space box read as one inside a container. Callers build a placement
 * against the display, because that is what a new widget is centred on, so
 * landing it on a page means subtracting the container's origin. A box that
 * misses the container entirely was never about this container — a widget just
 * created in the middle of the screen — so it is centred in it instead.
 */
function intoContainer(
  placement: WidgetPlacement | undefined,
  box: Required<WidgetPlacement>
): WidgetPlacement | undefined {
  const absolute = completePlacement(placement)
  if (!absolute) return placement
  const relative = { ...absolute, x: absolute.x - box.x, y: absolute.y - box.y }
  const misses =
    relative.x + relative.width <= 0 ||
    relative.y + relative.height <= 0 ||
    relative.x >= box.width ||
    relative.y >= box.height
  return misses ? centeredPlacement(box, absolute) : relative
}

/**
 * The single insertion path: adding, duplicating and pasting all land here, so
 * a new widget cannot skip a cap check or reuse an id. The widget is inserted
 * as given apart from its id, which is always fresh.
 */
export function insertWidget(
  configuration: DeviceConfiguration,
  widget: WidgetConfiguration,
  into: InsertionTarget | undefined = insertionTarget(configuration)
): WidgetSelection | undefined {
  if (!into) return undefined
  const { widgets, cap, box, depth } = into
  // A slot is built before every container that could hold one, so it is only
  // ever authored on a screen.
  if (box && widget.type === 'slot') return undefined
  // A container added inside one carries its own level, and the parser recurses
  // once per level — so this is the same bound the validator applies, checked
  // where the widget is created rather than after the device refuses it.
  if (isContainer(widget) && depth + 2 > MAXIMUM_NESTING_DEPTH) return undefined
  const pooled = allWidgetsOf(configuration).filter(({ type }) => type === widget.type).length
  if (pooled >= WIDGET_CAPACITIES[widget.type] || widgets.length >= cap) {
    return undefined
  }
  // A copy of a tap target is a second tap target, and the device holds
  // sixteen. Past that the copy is inserted without its action rather than
  // refused: what was asked for was the widget.
  const inserted = {
    ...widget,
    id: createWidgetId(),
    ...(box ? { placement: intoContainer(widget.placement, box) } : {})
  }
  if (inserted.action && actionCount(configuration) >= MAXIMUM_ACTIONS) {
    delete inserted.action
  }
  widgets.push(inserted)
  return { type: 'widget', id: inserted.id }
}

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

interface NewWidgetExtras {
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

const WIDGET_DEFAULTS: Record<
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
    source: { binding: 'vehicle.speed' },
    background_color: '#1E293B',
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.graph)
  }),
}

/**
 * Whether the dashboard already holds as many widgets of a kind as the device
 * has room for. The pool is dashboard-wide, so this counts every screen — and
 * it is asked before a tool is offered rather than after a widget silently
 * fails to appear.
 */
export function atWidgetCapacity(
  configuration: DeviceConfiguration | undefined,
  type: WidgetConfiguration['type']
): boolean {
  if (!configuration) return false
  const pooled = allWidgetsOf(configuration).filter((widget) => widget.type === type).length
  return pooled >= WIDGET_CAPACITIES[type]
}

/** Inserts a new widget of `type` where the author put it, or where the editor points. */
export function addWidget(
  type: WidgetConfiguration['type'],
  display: { width: number; height: number },
  extras: NewWidgetExtras = {}
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    const widget = WIDGET_DEFAULTS[type](display, extras)
    if (extras.placement) widget.placement = extras.placement
    added = insertWidget(configuration, widget, drawnTarget(configuration, extras.into))
  })
  return added
}

/**
 * The array a drawn box belongs to. Undefined hands the decision back to
 * `insertWidget`'s own rule; a container that cannot take the widget — a slot
 * whose page is missing, a shape that is gone — does the same rather than
 * dropping it silently.
 */
function drawnTarget(
  configuration: DeviceConfiguration,
  into: string | 'screen' | undefined
): InsertionTarget | undefined {
  if (into === undefined) return undefined
  return into === 'screen' ? screenTarget(configuration) : containerTarget(configuration, into)
}

function centeredPlacement(
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

export function deleteWidget(selection: WidgetSelection): boolean {
  if (selection.type !== 'widget') return false
  let deleted = false
  mutateDraftConfiguration((configuration) => {
    const location = findWidget(configuration, selection.id)
    if (!location) return
    const widgets = widgetArrayOf(configuration, location)
    const index = location.path[location.path.length - 1]
    if (!widgets || index === undefined) return
    widgets.splice(index, 1)
    deleted = true
    // An emptied array is dropped rather than left as `[]`, which the sparse
    // document has no use for. Its owner is the screen for a top-level widget
    // and the container above it otherwise.
    if (widgets.length > 0) return
    const owner = parentOf(configuration, location)
    if (owner) delete owner.widgets
  })
  return deleted
}

/**
 * Offsetting the copy is what makes it visible: an exact overlay looks like
 * nothing happened. The offset is clamped so a widget duplicated at the edge
 * stays on the display.
 */
const DUPLICATE_OFFSET_PX = 8

export function duplicateWidget(
  selection: WidgetSelection,
  display: { width: number; height: number }
): WidgetSelection | undefined {
  if (selection.type !== 'widget') return undefined
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    const source = findWidget(configuration, selection.id)?.widget
    if (!source) return
    // The copy stays beside its original, in the same container: a duplicate
    // that jumped out onto the screen was one the author had to put back every
    // time. Everything travels in absolute coordinates — offsetting and
    // clamping are against the display — and the insertion reads it back into
    // whatever box it lands in.
    const box = absolutePlacement(configuration, selection.id)
    const lifted = box ? { ...source, placement: box } : source
    const parent = parentContainerId(configuration, selection)
    added = insertWidget(
      configuration,
      offsetWidget(lifted, display),
      parent === undefined ? screenTarget(configuration) : containerTarget(configuration, parent)
    )
  })
  return added
}

export function offsetWidget(
  widget: WidgetConfiguration,
  display: { width: number; height: number }
): WidgetConfiguration {
  const placement = completePlacement(widget.placement)
  if (!placement) return structuredClone(widget)
  return {
    ...structuredClone(widget),
    placement: {
      ...placement,
      x: Math.min(placement.x + DUPLICATE_OFFSET_PX, display.width - placement.width),
      y: Math.min(placement.y + DUPLICATE_OFFSET_PX, display.height - placement.height)
    }
  }
}

export function actionCount(configuration: DeviceConfiguration | undefined): number {
  // Containers are widgets, so allWidgetsOf already reaches every tap target.
  return allWidgetsOf(configuration).filter(
    (target) => target.action && target.action.type !== 'none'
  ).length
}

/**
 * An empty transparent shape is an invisible rectangle that takes a tap — the
 * cheapest way to say "this corner of the screen goes back" without a widget to
 * press.
 */
export function addTapZone(
  display: { width: number; height: number },
  extras: Pick<NewWidgetExtras, 'placement' | 'into'> = {}
): string | undefined {
  let created: string | undefined
  mutateDraftConfiguration((configuration) => {
    // Through the one insertion path, so the shape pool cap and the fresh id
    // are handled where every other widget handles them.
    const selection = insertWidget(
      configuration,
      {
        type: 'shape',
        kind: 'rectangle',
        placement:
          extras.placement ??
          centeredPlacement(display, { width: TAP_ZONE_PX, height: TAP_ZONE_PX })
      },
      drawnTarget(configuration, extras.into)
    )
    created = selection?.type === 'widget' ? selection.id : undefined
  })
  return created
}

const TAP_ZONE_PX = 96

/**
 * Puts every font the dashboard already carries into one family, in a single
 * edit so it is a single undo. Sizes are left alone: a caption and a reading
 * are deliberately different sizes, and "one font everywhere" is a statement
 * about the face, not about the scale.
 */
export function applyFontFamilyToDashboard(family: string): void {
  mutateDraftConfiguration((configuration) => {
    for (const widget of allWidgetsOf(configuration)) applyFontFamily(widget, family)
  })
}
