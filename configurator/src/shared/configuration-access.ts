import { WIDGET_TYPES } from './configuration-schema'
import type {
  ApplicationConfiguration,
  ScreenConfiguration,
  ShapeWidgetConfiguration,
  TextWidgetConfiguration,
  ValueSourceConfiguration,
  WidgetConfiguration
} from './configuration-schema'

// Read helpers over the sparse configuration document. Every section is
// optional at every level, so these keep the `?.`/`??` chains in one place
// instead of repeating them at each call site.

export function screensOf(
  configuration: ApplicationConfiguration | undefined
): ScreenConfiguration[] {
  const screens = configuration?.dashboard?.screens
  return Array.isArray(screens) ? screens.filter(isRecord) : []
}

/**
 * The widgets authored directly inside one parent, without their own children.
 * A screen and a container shape hold the same array, which is why one function
 * answers for both.
 */
export function widgetsOf(
  parent: ScreenConfiguration | ShapeWidgetConfiguration | undefined
): WidgetConfiguration[] {
  const widgets = parent?.widgets
  return Array.isArray(widgets) ? widgets.filter(isWidget) : []
}

/**
 * One parent's children back to front: `z_index` ascending, authored array order
 * breaking ties. That is the rule the firmware applies within one LVGL parent,
 * so the layer list, the canvas and every restack answer it from here rather
 * than each keeping its own copy.
 *
 * Takes the raw array rather than `widgetsOf`, because a caller that writes the
 * result back must not silently drop whatever `widgetsOf` filtered out.
 */
export function stackOrder(
  widgets: readonly WidgetConfiguration[] | undefined
): { widget: WidgetConfiguration; index: number }[] {
  return (Array.isArray(widgets) ? widgets : [])
    .map((widget, index) => ({ widget, index }))
    .sort(
      (left, right) =>
        (left.widget.z_index ?? 0) - (right.widget.z_index ?? 0) || left.index - right.index
    )
}

/** One widget and everything nested inside it, parent before children. */
export function descendantsOf(widget: WidgetConfiguration): WidgetConfiguration[] {
  return widget.type === 'shape'
    ? [widget, ...widgetsOf(widget).flatMap(descendantsOf)]
    : [widget]
}

/**
 * Every widget of one screen in authored order, nested children included.
 * Anything that asks "what does this screen read, draw, or need a font for"
 * wants this rather than `widgetsOf`, which is the parenting question.
 */
export function screenWidgetsOf(screen: ScreenConfiguration | undefined): WidgetConfiguration[] {
  return widgetsOf(screen).flatMap(descendantsOf)
}

/** Every widget on every screen, in authored order. */
export function allWidgetsOf(
  configuration: ApplicationConfiguration | undefined
): WidgetConfiguration[] {
  return screensOf(configuration).flatMap(screenWidgetsOf)
}

// Several variants carry a frame, so anything reading text properties narrows
// on the type it actually wants rather than excluding the others.
export function isTextWidget(
  widget: WidgetConfiguration
): widget is TextWidgetConfiguration {
  return widget.type === 'text'
}

/**
 * Every telemetry binding a dashboard reads, in the order the widgets declare
 * them: the several sources a text widget composes, the single source a gauge
 * maps, and the field a styling rule watches even though the widget never shows
 * it. Probing for the property rather than switching on the type keeps a new
 * widget type from silently losing its telemetry.
 */
export function dashboardBindings(
  configuration: ApplicationConfiguration | undefined
): string[] {
  const bindings = new Set<string>()
  for (const widget of allWidgetsOf(configuration)) {
    for (const source of widgetSources(widget)) {
      if (source.binding) bindings.add(source.binding)
      // A lap timer modifier replaces the reading with module state the device
      // derives from the current lap time, so that is the field it needs.
      if (source.modifiers?.some((modifier) => modifier?.type === 'lap_timer')) {
        bindings.add('session.lap.current_time')
      }
    }
  }
  return [...bindings]
}

export function widgetSources(widget: WidgetConfiguration): ValueSourceConfiguration[] {
  return [
    ...(isTextWidget(widget) ? widget.sources ?? [] : []),
    ...('source' in widget && widget.source ? [widget.source] : []),
    ...(widget.condition_source ? [widget.condition_source] : [])
  ]
}

/**
 * Stable identity for a widget across edits. Selection, undo, and the preview
 * all address widgets by id, so reordering or deleting a sibling no longer
 * silently retargets them the way an array index did.
 */
export function createWidgetId(): string {
  return `w${Date.now().toString(36)}${Math.floor(Math.random() * 0x1000).toString(36)}`
}

/**
 * Assigns an id to every widget and screen that lacks one, at any depth. Ids are
 * optional in the schema, so an imported or hand-written document may arrive
 * without them, and everything is addressed by id in selection, the layer tree
 * and undo history.
 */
export function withWidgetIds(
  configuration: ApplicationConfiguration
): ApplicationConfiguration {
  const screens = screensOf(configuration)
  if (screens.length === 0) return configuration
  const used = new Set<string>()
  const unique = (candidate: string | undefined): string => {
    const value = candidate && !used.has(candidate) ? candidate : createWidgetId()
    used.add(value)
    return value
  }
  // Recursive because a container is just a widget that holds more of them, so
  // one walk names every level rather than one pass per level of nesting.
  const withIds = <T extends ScreenConfiguration | ShapeWidgetConfiguration>(owner: T): T =>
    owner.widgets
      ? {
          ...owner,
          widgets: widgetsOf(owner).map((widget) => {
            const named = { ...widget, id: unique(widget.id) }
            return named.type === 'shape' ? withIds(named) : named
          })
        }
      : owner
  return {
    ...configuration,
    dashboard: {
      ...configuration.dashboard,
      screens: screens.map((screen, index) => ({
        ...withIds(screen),
        id: screen.id ?? `screen${index + 1}`
      }))
    }
  }
}

/**
 * Serializes with recursively sorted keys so two documents that differ only in
 * property order or formatting compare equal.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

export function configurationsEqual(
  left: ApplicationConfiguration | undefined,
  right: ApplicationConfiguration | undefined
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return canonicalJson(left) === canonicalJson(right)
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (typeof value !== 'object' || value === null) return value
  const entries = Object.entries(value as Record<string, unknown>)
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return Object.fromEntries(entries.map(([key, item]) => [key, sortKeys(item)]))
}

function isRecord<T>(value: unknown): value is T {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Driven by the generated list rather than a hand-kept one: a widget type this
// missed would be dropped from every read helper without a word, including the
// telemetry the SimHub profile has to request.
function isWidget(value: unknown): value is WidgetConfiguration {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    WIDGET_TYPES.includes((value as WidgetConfiguration).type)
  )
}
