// Schema 3 gave a text widget one `binding` with its `modifiers` and
// `transform` at the widget level. Schema 4 replaced them with the ordered
// `sources` array, and the device accepts only the new shape, so every document
// entering the configurator — project file or device payload — is brought
// forward here instead of at each call site. Migration mutates the document it
// is given, which is always one the caller has just parsed.

const LEGACY_SOURCE_KEYS = ['binding', 'modifiers', 'transform'] as const

export function migrateConfigurationDocument(document: unknown): unknown {
  if (!isObject(document)) return document
  const dashboard = document.dashboard
  if (!isObject(dashboard) || !Array.isArray(dashboard.screens)) return document
  for (const screen of dashboard.screens) {
    if (!isObject(screen) || !Array.isArray(screen.widgets)) continue
    for (const widget of screen.widgets) migrateTextWidget(widget)
  }
  return document
}

/**
 * Every schema-3 text widget had exactly one source, so one is always written —
 * a widget that named no binding was relying on the schema default and keeps
 * relying on it.
 */
function migrateTextWidget(widget: unknown): void {
  if (!isObject(widget) || widget.type !== 'text' || widget.sources !== undefined) return
  const source: Record<string, unknown> = {}
  for (const key of LEGACY_SOURCE_KEYS) {
    if (widget[key] === undefined) continue
    source[key] = widget[key]
    delete widget[key]
  }
  widget.sources = [source]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
