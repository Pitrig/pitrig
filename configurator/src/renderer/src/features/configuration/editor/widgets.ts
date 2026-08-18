import { allWidgetsOf, createWidgetId, pagesOf } from '../../../../../shared/configuration-access'
import { type FontSpec, MAXIMUM_ACTIONS, MAXIMUM_ARC_WIDGETS, MAXIMUM_BAR_WIDGETS, MAXIMUM_GRAPH_WIDGETS, MAXIMUM_IMAGE_WIDGETS, MAXIMUM_INDICATOR_WIDGETS, MAXIMUM_SHAPE_WIDGETS, MAXIMUM_SLOT_WIDGETS, MAXIMUM_TEXT_WIDGETS, MAXIMUM_WIDGETS_PER_CONTAINER, MAXIMUM_WIDGETS_PER_SCREEN, type WidgetConfiguration, type WidgetPlacement } from '../../../../../shared/configuration-schema'
import { type DeviceConfiguration } from '../../../../../shared/device'
import { documentFonts } from '../../../../../shared/document-fonts'
import { DEFAULT_FONT_FAMILY } from '../../../../../shared/font-assets'
import { absolutePlacement, completePlacement, findWidget, mutateDraftConfiguration, parentOf, widgetArrayOf } from './document'
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

/**
 * Where a new widget lands: the page being edited while a slot is open, and the
 * active screen otherwise. Adding a widget while looking inside a slot has to
 * put it where the author is looking, and a page is the only other array a
 * widget can be authored in.
 */
function insertionTarget(
  configuration: DeviceConfiguration
): {
  widgets: WidgetConfiguration[]
  cap: number
  box?: Required<WidgetPlacement>
} | undefined {
  const { drillIn, slotPage } = useDashboardEditorStore.getState()
  if (drillIn) {
    const slot = findWidget(configuration, drillIn)?.widget
    if (slot?.type === 'slot') {
      const page = pagesOf(slot)[slotPage[drillIn] ?? 0]
      if (page) {
        return {
          widgets: (page.widgets ??= []),
          cap: MAXIMUM_WIDGETS_PER_CONTAINER,
          box: completePlacement(slot.placement)
        }
      }
    }
  }
  const screen = ensureScreen(configuration)
  return { widgets: (screen.widgets ??= []), cap: MAXIMUM_WIDGETS_PER_SCREEN }
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
  return misses ? centeredPlacement(box, absolute.width, absolute.height) : relative
}

/**
 * The single insertion path: adding, duplicating and pasting all land here, so
 * a new widget cannot skip a cap check or reuse an id. The widget is inserted
 * as given apart from its id, which is always fresh.
 */
export function insertWidget(
  configuration: DeviceConfiguration,
  widget: WidgetConfiguration
): WidgetSelection | undefined {
  const target = insertionTarget(configuration)
  if (!target) return undefined
  const { widgets, cap, box } = target
  // A slot is built before every container that could hold one, so it is only
  // ever authored on a screen.
  if (box && widget.type === 'slot') return undefined
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
 * The family the dashboard already draws with. A new widget in some other
 * family stands out for no reason the author asked for, and — since the device
 * holds one face per family — it also adds a family to the upload. Falling back
 * to the connected board's first installed family, and then to the default
 * name, keeps a new widget from having no font at all, which the device rejects
 * the whole document over.
 */
export function draftFontFamily(
  configuration: DeviceConfiguration | undefined,
  installedFamily?: string
): string {
  const families = draftFonts(configuration)
    .map((font) => font.family)
    .filter((family): family is string => Boolean(family))
  return commonest(families) ?? installedFamily ?? DEFAULT_FONT_FAMILY
}

/**
 * The font a new reading should take: the dashboard's family at the size its
 * other readings already use, so a widget added beside them matches them.
 */
export function draftValueFont(
  configuration: DeviceConfiguration | undefined,
  installedFamily?: string
): FontSpec {
  const family = draftFontFamily(configuration, installedFamily)
  const sizes = draftFonts(configuration)
    .filter((font) => font.family === family)
    .map((font) => font.size_px)
    .filter((size): size is number => typeof size === 'number' && size > 0)
  return { family, size_px: commonest(sizes) ?? DEFAULT_WIDGET_FONT_SIZE_PX }
}

// A widget with no font is rejected by the device as a whole-document error,
// so a newly added one adopts an installed family when the board has any.
// Without fonts installed it is created bare and the validator explains why.
export function addTextWidget(
  display: { width: number; height: number },
  font?: FontSpec
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, {
      type: 'text',
      // A text widget renders its sources, so it always has at least one. The
      // empty source takes the schema default binding.
      sources: [{}],
      ...(font ? { value: { font } } : {}),
      placement: centeredPlacement(display, 120, 64)
    })
  })
  return added
}

export function addShapeWidget(
  display: { width: number; height: number }
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, {
      type: 'shape',
      // A shape with nothing painted would be invisible, so it starts as a
      // visible plate the author can restyle.
      background_color: '#1E293B',
      placement: centeredPlacement(display, 160, 80)
    })
  })
  return added
}

/**
 * A slot starts with two pages in the loop, because one page that switches to
 * nothing is not a slot — the pair is the smallest thing that shows what the
 * widget is for. It is created bare: a slot draws nothing, and the device
 * refuses one that tries to.
 */
export function addSlotWidget(
  display: { width: number; height: number }
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, {
      type: 'slot',
      pages: [{}, {}],
      placement: centeredPlacement(display, 200, 100)
    })
  })
  return added
}

export function addBarWidget(
  display: { width: number; height: number }
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, {
      type: 'bar',
      // The frame background is the track the fill runs over, so a new bar
      // starts with one; the default 0..1 window suits a normalized source.
      background_color: '#1E293B',
      source: { binding: 'vehicle.throttle' },
      placement: centeredPlacement(display, 200, 24)
    })
  })
  return added
}

export function addArcWidget(
  display: { width: number; height: number }
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, {
      type: 'arc',
      source: { binding: 'engine.rpm_percent' },
      // A visible track is what makes an empty gauge read as a gauge.
      track_color: '#1E293B',
      placement: centeredPlacement(display, 120, 120)
    })
  })
  return added
}

export function addIndicatorWidget(
  display: { width: number; height: number }
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, {
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
      placement: centeredPlacement(display, 240, 20)
    })
  })
  return added
}

export function addImageWidget(
  display: { width: number; height: number },
  image?: string
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, {
      type: 'image',
      // The device draws an image at the size it was uploaded at, so a new
      // widget starts at that size when one is installed.
      ...(image ? { image } : {}),
      placement: centeredPlacement(display, 96, 96)
    })
  })
  return added
}

export function addGraphWidget(
  display: { width: number; height: number }
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, {
      type: 'graph',
      source: { binding: 'vehicle.speed' },
      background_color: '#1E293B',
      placement: centeredPlacement(display, 200, 80)
    })
  })
  return added
}

function centeredPlacement(
  display: { width: number; height: number },
  preferredWidth: number,
  preferredHeight: number
): WidgetPlacement {
  const width = Math.min(preferredWidth, display.width)
  const height = Math.min(preferredHeight, display.height)
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
    // The copy lands on the screen whatever the source was in, so a widget
    // authored inside a container is lifted to absolute coordinates first — its
    // relative box would otherwise be read against the display.
    const box = absolutePlacement(configuration, selection.id)
    const lifted = box ? { ...source, placement: box } : source
    added = insertWidget(configuration, offsetWidget(lifted, display))
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
export function addTapZone(display: { width: number; height: number }): string | undefined {
  let created: string | undefined
  mutateDraftConfiguration((configuration) => {
    // Through the one insertion path, so the shape pool cap and the fresh id
    // are handled where every other widget handles them.
    const selection = insertWidget(configuration, {
      type: 'shape',
      kind: 'rectangle',
      placement: centeredPlacement(display, TAP_ZONE_PX, TAP_ZONE_PX)
    })
    created = selection?.type === 'widget' ? selection.id : undefined
  })
  return created
}

const TAP_ZONE_PX = 96

