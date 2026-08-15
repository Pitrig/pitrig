import type {
  ApplicationConfiguration,
  DeltaTimeWidgetConfiguration,
  ScreenConfiguration,
  TextWidgetConfiguration,
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

export function widgetsOf(screen: ScreenConfiguration | undefined): WidgetConfiguration[] {
  const widgets = screen?.widgets
  return Array.isArray(widgets) ? widgets.filter(isWidget) : []
}

/** Every widget on every screen, in authored order. */
export function allWidgetsOf(
  configuration: ApplicationConfiguration | undefined
): WidgetConfiguration[] {
  return screensOf(configuration).flatMap(widgetsOf)
}

export function isTextWidget(
  widget: WidgetConfiguration
): widget is TextWidgetConfiguration {
  return widget.type === 'text'
}

export function isDeltaTimeWidget(
  widget: WidgetConfiguration
): widget is DeltaTimeWidgetConfiguration {
  return widget.type === 'delta_time'
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
 * Assigns an id to every widget and screen that lacks one. Ids are optional in
 * the schema, so an imported or hand-written document may arrive without them.
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
  return {
    ...configuration,
    dashboard: {
      ...configuration.dashboard,
      screens: screens.map((screen, index) => ({
        ...screen,
        id: screen.id ?? `screen${index + 1}`,
        ...(screen.widgets
          ? {
              widgets: widgetsOf(screen).map((widget) => ({
                ...widget,
                id: unique(widget.id)
              }))
            }
          : {})
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

function isRecord(value: unknown): value is ScreenConfiguration {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWidget(value: unknown): value is WidgetConfiguration {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    ((value as WidgetConfiguration).type === 'text' ||
      (value as WidgetConfiguration).type === 'delta_time')
  )
}
