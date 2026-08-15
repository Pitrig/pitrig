import {
  MAXIMUM_PAYLOAD_SIZE,
  SCHEMA_CHILD_TYPES,
  SCHEMA_OBJECT_KEYS,
  WIDGET_TYPES
} from './configuration-schema'
import type { ApplicationConfiguration } from './configuration-schema'
import { allWidgetsOf } from './configuration-access'
import { FONT_FAMILY_PATTERN, MAXIMUM_FONT_ASSETS, MAXIMUM_FONT_SIZE_PX } from './font-assets'

// The single configuration validator. The renderer, the main process, and file
// import all use this instead of keeping their own partial copies, and the key
// allow-lists come from the same generated schema the firmware parser uses — so
// the configurator can no longer ship a payload the device answers with
// `unknown_property`.

export type ValidationResult =
  | { ok: true; configuration: ApplicationConfiguration; payloadBytes: number }
  | { ok: false; error: string }

export interface ValidateOptions {
  /** Board identifiers this build supports; a document targeting another is rejected. */
  supportedBoards: readonly string[]
}

export function validateConfigurationDocument(
  value: unknown,
  options: ValidateOptions
): ValidationResult {
  if (!isObject(value)) {
    return { ok: false, error: 'Configuration must be a JSON object.' }
  }
  const configuration = value as unknown as ApplicationConfiguration
  if (
    typeof configuration.board !== 'string' ||
    !options.supportedBoards.includes(configuration.board)
  ) {
    return { ok: false, error: 'Configuration must target a supported board.' }
  }
  if (
    configuration.hardware !== undefined &&
    (!Array.isArray(configuration.hardware) || configuration.hardware.length !== 0)
  ) {
    return { ok: false, error: 'The hardware list must be an empty array.' }
  }

  const unknown = findUnknownProperty(value, 'ApplicationConfiguration', '')
  if (unknown) return { ok: false, error: unknown }

  const fontError = findFontError(configuration)
  if (fontError) return { ok: false, error: fontError }

  const payloadBytes = new TextEncoder().encode(JSON.stringify(configuration)).byteLength
  if (payloadBytes > MAXIMUM_PAYLOAD_SIZE) {
    return {
      ok: false,
      error: `Configuration exceeds the ${MAXIMUM_PAYLOAD_SIZE}-byte device limit.`
    }
  }
  return { ok: true, configuration, payloadBytes }
}

/** Walks the document against the generated allow-lists, mirroring the firmware. */
function findUnknownProperty(
  node: unknown,
  structName: string,
  path: string
): string | undefined {
  if (!isObject(node)) return undefined
  const allowed = SCHEMA_OBJECT_KEYS[structName]
  const children = SCHEMA_CHILD_TYPES[structName] ?? {}
  for (const [key, child] of Object.entries(node)) {
    const here = path ? `${path}.${key}` : key
    if (allowed && !allowed.includes(key)) {
      return `Unknown property "${here}" is not part of the configuration schema.`
    }
    if (structName === 'ScreenConfiguration' && key === 'widgets') {
      const error = checkWidgets(child, here)
      if (error) return error
      continue
    }
    const childType = children[key]
    if (!childType) continue
    if (Array.isArray(child)) {
      for (let index = 0; index < child.length; ++index) {
        const error = findUnknownProperty(child[index], childType, `${here}[${index}]`)
        if (error) return error
      }
      continue
    }
    const error = findUnknownProperty(child, childType, here)
    if (error) return error
  }
  return undefined
}

function checkWidgets(value: unknown, path: string): string | undefined {
  if (!Array.isArray(value)) return `"${path}" must be an array of widgets.`
  for (let index = 0; index < value.length; ++index) {
    const widget = value[index]
    const here = `${path}[${index}]`
    if (!isObject(widget)) return `"${here}" must be an object.`
    const type = (widget as { type?: unknown }).type
    if (typeof type !== 'string' || !WIDGET_TYPES.includes(type)) {
      return `"${here}.type" must be one of ${WIDGET_TYPES.join(', ')}.`
    }
    const structName =
      type === 'text' ? 'TextWidgetConfiguration' : 'DeltaTimeWidgetConfiguration'
    const error = findUnknownProperty(widget, structName, here)
    if (error) return error
  }
  return undefined
}

function findFontError(configuration: ApplicationConfiguration): string | undefined {
  const fonts: Array<{ family?: string; size_px?: number } | undefined> = []
  for (const widget of allWidgetsOf(configuration)) {
    if (widget.type === 'delta_time') {
      fonts.push(widget.font)
      continue
    }
    if (widget.title?.text) fonts.push(widget.title.font)
    fonts.push(widget.value?.font)
  }
  for (const font of fonts) {
    if (
      !font ||
      typeof font.family !== 'string' ||
      !FONT_FAMILY_PATTERN.test(font.family) ||
      !Number.isInteger(font.size_px) ||
      (font.size_px ?? 0) < 1 ||
      (font.size_px ?? 0) > MAXIMUM_FONT_SIZE_PX
    ) {
      return 'Every dashboard font must explicitly define a valid family and size_px.'
    }
  }
  const unique = new Set(fonts.map((font) => `${font?.family}:${font?.size_px}`))
  if (unique.size > MAXIMUM_FONT_ASSETS) {
    return `Configuration requires more than ${MAXIMUM_FONT_ASSETS} unique font assets.`
  }
  return undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
