import { allWidgetsOf, createWidgetId, groupsOf, screensOf } from '../../../../../shared/configuration-access'
import { type FontSpec, MAXIMUM_ACTIONS, MAXIMUM_ARC_WIDGETS, MAXIMUM_BAR_WIDGETS, MAXIMUM_GRAPH_WIDGETS, MAXIMUM_GROUPS, MAXIMUM_IMAGE_WIDGETS, MAXIMUM_INDICATOR_WIDGETS, MAXIMUM_SHAPE_WIDGETS, MAXIMUM_TEXT_WIDGETS, MAXIMUM_WIDGETS_PER_SCREEN, type WidgetConfiguration, type WidgetPlacement } from '../../../../../shared/configuration-schema'
import { type DeviceConfiguration } from '../../../../../shared/device'
import { DEFAULT_FONT_FAMILY } from '../../../../../shared/font-assets'
import { absolutePlacement, completePlacement, findWidget, mutateDraftConfiguration, widgetArrayOf } from './document'
import { ensureScreen } from './screens'
import { type WidgetSelection } from './store'

const WIDGET_CAPACITIES: Record<WidgetConfiguration['type'], number> = {
  text: MAXIMUM_TEXT_WIDGETS,
  shape: MAXIMUM_SHAPE_WIDGETS,
  bar: MAXIMUM_BAR_WIDGETS,
  arc: MAXIMUM_ARC_WIDGETS,
  indicator: MAXIMUM_INDICATOR_WIDGETS,
  graph: MAXIMUM_GRAPH_WIDGETS,
  image: MAXIMUM_IMAGE_WIDGETS
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
  const screen = ensureScreen(configuration)
  const widgets = (screen.widgets ??= [])
  const pooled = allWidgetsOf(configuration).filter(({ type }) => type === widget.type).length
  if (
    pooled >= WIDGET_CAPACITIES[widget.type] ||
    widgets.length >= MAXIMUM_WIDGETS_PER_SCREEN
  ) {
    return undefined
  }
  // A copy of a tap target is a second tap target, and the device holds
  // sixteen. Past that the copy is inserted without its action rather than
  // refused: what was asked for was the widget.
  const inserted = { ...widget, id: createWidgetId() }
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
  const fonts: FontSpec[] = []
  for (const widget of allWidgetsOf(configuration)) {
    if (widget.title?.text && widget.title.font) fonts.push(widget.title.font)
    if ('value' in widget && widget.value?.font) fonts.push(widget.value.font)
  }
  return fonts
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
    if (!widgets) return
    widgets.splice(location.widgetIndex, 1)
    deleted = true
    if (widgets.length > 0) return
    const screen = configuration.dashboard?.screens?.[location.screenIndex]
    if (!screen) return
    if (location.groupIndex === undefined) {
      delete screen.widgets
      return
    }
    const group = screen.groups?.[location.groupIndex]
    if (group) delete group.widgets
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
    // authored inside a group is lifted to absolute coordinates first — its
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
  const targets = [
    ...allWidgetsOf(configuration),
    ...screensOf(configuration).flatMap(groupsOf)
  ]
  return targets.filter((target) => target.action && target.action.type !== 'none').length
}

/**
 * An empty group is an invisible rectangle that takes a tap — the cheapest way
 * to say "this corner of the screen goes back" without a widget to press.
 */
export function addTapZone(display: { width: number; height: number }): string | undefined {
  const id = createWidgetId()
  let created: string | undefined
  mutateDraftConfiguration((configuration) => {
    const screen = ensureScreen(configuration)
    const groups = (screen.groups ??= [])
    if (groups.length >= MAXIMUM_GROUPS) return
    groups.push({ id, placement: centeredPlacement(display, TAP_ZONE_PX, TAP_ZONE_PX) })
    created = id
  })
  return created
}

const TAP_ZONE_PX = 96

/**
 * Wraps the selected widgets in a group sized to their bounds, rewriting their
 * geometry to be relative to it. Grouping is a document edit rather than an
 * editor annotation, because the device needs the group to switch what an area
 * of the screen shows — see ADR 0021.
 *
 * Only ungrouped widgets on one screen can be grouped: a group has one parent,
 * and moving a widget between groups is a separate edit.
 */
