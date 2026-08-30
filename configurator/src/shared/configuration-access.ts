import {
  MAXIMUM_ARC_WIDGETS,
  MAXIMUM_BAR_WIDGETS,
  MAXIMUM_GRAPH_WIDGETS,
  MAXIMUM_IMAGE_WIDGETS,
  MAXIMUM_INDICATOR_WIDGETS,
  MAXIMUM_SHAPE_WIDGETS,
  MAXIMUM_SLOT_WIDGETS,
  MAXIMUM_TEXT_WIDGETS,
  WIDGET_TYPES
} from './configuration-schema'
import type {
  ApplicationConfiguration,
  ArcWidgetConfiguration,
  BarWidgetConfiguration,
  GraphWidgetConfiguration,
  ImageWidgetConfiguration,
  IndicatorWidgetConfiguration,
  ScreenConfiguration,
  ShapeWidgetConfiguration,
  SlotPageConfiguration,
  SlotWidgetConfiguration,
  TextWidgetConfiguration,
  ValueSourceConfiguration,
  WidgetConfiguration
} from './configuration-schema'

export type WidgetParent = ScreenConfiguration | ShapeWidgetConfiguration | SlotPageConfiguration

export type FramedWidgetConfiguration =
  | TextWidgetConfiguration
  | ShapeWidgetConfiguration
  | BarWidgetConfiguration
  | ArcWidgetConfiguration
  | IndicatorWidgetConfiguration
  | GraphWidgetConfiguration
  | ImageWidgetConfiguration

export const WIDGET_POOL_CAPACITIES: Record<WidgetConfiguration['type'], number> = {
  text: MAXIMUM_TEXT_WIDGETS,
  shape: MAXIMUM_SHAPE_WIDGETS,
  bar: MAXIMUM_BAR_WIDGETS,
  arc: MAXIMUM_ARC_WIDGETS,
  indicator: MAXIMUM_INDICATOR_WIDGETS,
  graph: MAXIMUM_GRAPH_WIDGETS,
  image: MAXIMUM_IMAGE_WIDGETS,
  slot: MAXIMUM_SLOT_WIDGETS
}

export function screensOf(
  configuration: ApplicationConfiguration | undefined
): ScreenConfiguration[] {
  const screens = configuration?.dashboard?.screens
  return Array.isArray(screens) ? screens.filter(isRecord) : []
}

export function widgetsOf(parent: WidgetParent | undefined): WidgetConfiguration[] {
  const widgets = parent?.widgets
  return Array.isArray(widgets) ? widgets.filter(isWidget) : []
}

export function pagesOf(widget: SlotWidgetConfiguration | undefined): SlotPageConfiguration[] {
  const pages = widget?.pages
  return Array.isArray(pages) ? pages.filter(isRecord) : []
}

export function childArraysOf(widget: WidgetConfiguration): WidgetConfiguration[][] {
  if (widget.type === 'shape') return [widgetsOf(widget)]
  if (widget.type === 'slot') return pagesOf(widget).map((page) => widgetsOf(page))
  return []
}

export function isContainer(widget: WidgetConfiguration): boolean {
  return widget.type === 'shape' || widget.type === 'slot'
}

export function subtreeHeight(widget: WidgetConfiguration): number {
  const children = childArraysOf(widget).flat()
  if (children.length === 0) return 0
  return 1 + Math.max(...children.map(subtreeHeight))
}

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

export function descendantsOf(widget: WidgetConfiguration): WidgetConfiguration[] {
  return [widget, ...childArraysOf(widget).flat().flatMap(descendantsOf)]
}

export function screenWidgetsOf(screen: ScreenConfiguration | undefined): WidgetConfiguration[] {
  return widgetsOf(screen).flatMap(descendantsOf)
}

export function allWidgetsOf(
  configuration: ApplicationConfiguration | undefined
): WidgetConfiguration[] {
  return screensOf(configuration).flatMap(screenWidgetsOf)
}

export function isTextWidget(
  widget: WidgetConfiguration
): widget is TextWidgetConfiguration {
  return widget.type === 'text'
}

export function dashboardBindings(
  configuration: ApplicationConfiguration | undefined
): string[] {
  const bindings = new Set<string>()
  for (const widget of allWidgetsOf(configuration)) {
    for (const source of widgetSources(widget)) {
      if (source.binding) bindings.add(source.binding)
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
    ...('traces' in widget && Array.isArray(widget.traces)
      ? widget.traces.flatMap((trace) => (trace?.source ? [trace.source] : []))
      : []),
    ...(widget.condition_source ? [widget.condition_source] : []),
    ...(widget.type === 'slot'
      ? pagesOf(widget).flatMap((page) => (page.source ? [page.source] : []))
      : [])
  ]
}

export function createWidgetId(): string {
  return `w${Date.now().toString(36)}${Math.floor(Math.random() * 0x1000).toString(36)}`
}

export function freshWidgetIds(
  widget: WidgetConfiguration
): WidgetConfiguration & { id: string } {
  widget.id = createWidgetId()
  for (const children of childArraysOf(widget)) {
    for (const child of children) freshWidgetIds(child)
  }
  return widget as WidgetConfiguration & { id: string }
}

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
  const named = (widget: WidgetConfiguration): WidgetConfiguration => {
    const withId = { ...widget, id: unique(widget.id) }
    if (withId.type === 'slot') {
      return { ...withId, ...(withId.pages ? { pages: pagesOf(withId).map(withIds) } : {}) }
    }
    return withId.type === 'shape' ? withIds(withId) : withId
  }
  const withIds = <T extends WidgetParent>(owner: T): T =>
    owner.widgets ? { ...owner, widgets: widgetsOf(owner).map(named) } : owner
  return {
    ...configuration,
    dashboard: {
      ...configuration.dashboard,
      screens: screens.map((screen, index) => ({
        ...withIds<ScreenConfiguration>(screen),
        id: screen.id ?? `screen${index + 1}`
      }))
    }
  }
}

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

function isWidget(value: unknown): value is WidgetConfiguration {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    WIDGET_TYPES.includes((value as WidgetConfiguration).type)
  )
}
