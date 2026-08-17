import {
  MAXIMUM_ACTIONS,
  MAXIMUM_GROUPS,
  MAXIMUM_PAYLOAD_SIZE,
  MAXIMUM_SCREENS,
  SCHEMA_CHILD_TYPES,
  SCHEMA_OBJECT_KEYS,
  SCHEMA_WIDGET_STRUCTS,
  TEXT_CAPACITIES,
  WIDGET_TYPES
} from './configuration-schema'
import type { ApplicationConfiguration, WidgetAction } from './configuration-schema'
import { allWidgetsOf, groupsOf, isTextWidget, widgetsOf } from './configuration-access'
import { FONT_FAMILY_PATTERN, MAXIMUM_FONT_FAMILIES, MAXIMUM_FONT_SIZE_PX } from './font-assets'

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

  const screenError = findScreenError(configuration)
  if (screenError) return { ok: false, error: screenError }

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
    // Bounded strings are stored with a terminator, so the device rejects one
    // byte before the capacity. Catching it here names the property instead of
    // leaving the board to answer with a path.
    const capacity = TEXT_CAPACITIES[`${structName}.${key}`]
    if (capacity !== undefined && typeof child === 'string') {
      const bytes = new TextEncoder().encode(child).byteLength
      if (bytes >= capacity) {
        return `"${here}" is ${bytes} bytes; the device stores at most ${capacity - 1}.`
      }
    }
    // Widgets nest one level under a screen and two under a group, and both
    // arrays are the same discriminated union.
    if (
      (structName === 'ScreenConfiguration' || structName === 'GroupConfiguration') &&
      key === 'widgets'
    ) {
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
    // Generated, so a new widget type cannot be silently checked against
    // another variant's properties.
    const structName = SCHEMA_WIDGET_STRUCTS[type]
    if (!structName) return `"${here}.type" must be one of ${WIDGET_TYPES.join(', ')}.`
    const error = findUnknownProperty(widget, structName, here)
    if (error) return error
  }
  return undefined
}

/**
 * The screen array is bounded on the device, and the editor only ever authors
 * the first one — but the advanced JSON editor can write any array, so the cap
 * belongs here rather than in the canvas.
 */
function findScreenError(configuration: ApplicationConfiguration): string | undefined {
  const screens = configuration.dashboard?.screens
  if (screens === undefined) return undefined
  if (!Array.isArray(screens)) return '"dashboard.screens" must be an array of screens.'
  if (screens.length > MAXIMUM_SCREENS) {
    return `A dashboard carries at most ${MAXIMUM_SCREENS} screen(s); this one declares ${screens.length}.`
  }
  const screenIds = screens.map((screen) => screen?.id)
  let actions = 0
  for (const [screenIndex, screen] of screens.entries()) {
    const groups = groupsOf(screen)
    if (groups.length > MAXIMUM_GROUPS) {
      return `Screen ${screenIndex + 1} carries ${groups.length} groups; the device holds ${MAXIMUM_GROUPS}.`
    }
    for (const widget of widgetsOf(screen)) {
      const error = findActionError(widget.action, screenIds, `widget "${widget.id ?? ''}"`)
      if (error) return error
      if (widget.action && widget.action.type !== 'none') actions += 1
    }
    for (const group of groups) {
      const label = `group "${group.id ?? ''}"`
      const error = findActionError(group.action, screenIds, label)
      if (error) return error
      if (group.action && group.action.type !== 'none') actions += 1
      if ((group.slot ?? 0) > 0 && group.action && group.action.type !== 'none') {
        return `${label} is in a slot and also navigates; a tap can only mean one of those.`
      }
      // The device refuses a widget that does not fit its group at composition
      // time, which is later than an author wants to hear it.
      const box = group.placement
      for (const widget of widgetsOf(group)) {
        const error = findActionError(widget.action, screenIds, `widget "${widget.id ?? ''}"`)
        if (error) return error
        if (widget.action && widget.action.type !== 'none') actions += 1
        const inner = widget.placement
        if (
          box &&
          inner &&
          ((inner.x ?? 0) + (inner.width ?? 0) > (box.width ?? 0) ||
            (inner.y ?? 0) + (inner.height ?? 0) > (box.height ?? 0))
        ) {
          return `Widget "${widget.id ?? ''}" does not fit inside ${label}; a grouped widget is placed relative to the group's box.`
        }
      }
    }
    // Slot rules: one box, one default.
    const slots = new Set(groups.map((group) => group.slot ?? 0).filter((slot) => slot > 0))
    for (const slot of slots) {
      const members = groups.filter((group) => (group.slot ?? 0) === slot)
      const defaults = members.filter((group) => group.slot_default).length
      if (defaults !== 1) {
        return `Slot ${slot} on screen ${screenIndex + 1} needs exactly one group marked as shown first; it has ${defaults}.`
      }
      const first = members[0]?.placement
      if (
        members.some(
          (group) =>
            group.placement?.x !== first?.x ||
            group.placement?.y !== first?.y ||
            group.placement?.width !== first?.width ||
            group.placement?.height !== first?.height
        )
      ) {
        return `The groups of slot ${slot} on screen ${screenIndex + 1} must share one box.`
      }
    }
  }
  if (actions > MAXIMUM_ACTIONS) {
    return `This dashboard has ${actions} tap targets; the device binds at most ${MAXIMUM_ACTIONS}.`
  }
  return undefined
}

function findActionError(
  action: WidgetAction | undefined,
  screenIds: readonly (string | undefined)[],
  owner: string
): string | undefined {
  if (!action || action.type === 'none') return undefined
  if (action.type === 'goto_screen') {
    if (!action.screen) return `${owner} navigates to a screen but names none.`
    if (!screenIds.includes(action.screen)) {
      return `${owner} navigates to screen "${action.screen}", which this dashboard does not have.`
    }
    return undefined
  }
  if (action.screen) {
    return `${owner} names a screen for ${action.type}, which navigates relatively; drop the screen.`
  }
  return undefined
}

function findFontError(configuration: ApplicationConfiguration): string | undefined {
  const fonts: Array<{ family?: string; size_px?: number } | undefined> = []
  for (const widget of allWidgetsOf(configuration)) {
    // Only the types that draw text need a font; a shape needs none.
    if (!isTextWidget(widget)) continue
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
  // The device stores one face per family and rasterizes every size from it, so
  // families are the bounded resource; sizes cost nothing to add.
  const families = new Set(fonts.map((font) => font?.family))
  if (families.size > MAXIMUM_FONT_FAMILIES) {
    return `Configuration references more than ${MAXIMUM_FONT_FAMILIES} font families.`
  }
  return undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
