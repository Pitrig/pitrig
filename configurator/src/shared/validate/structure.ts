import {
  MAXIMUM_ACTIONS,
  MAXIMUM_ARC_WIDGETS,
  MAXIMUM_BAR_WIDGETS,
  MAXIMUM_GRAPH_WIDGETS,
  MAXIMUM_IMAGE_WIDGETS,
  MAXIMUM_INDICATOR_WIDGETS,
  MAXIMUM_NESTING_DEPTH,
  MAXIMUM_SCREENS,
  MAXIMUM_SHAPE_WIDGETS,
  MAXIMUM_SLOT_PAGES,
  MAXIMUM_SLOT_WIDGETS,
  MAXIMUM_TEXT_WIDGETS,
  MAXIMUM_WIDGETS_PER_CONTAINER,
  MAXIMUM_WIDGETS_PER_SCREEN,
  type ApplicationConfiguration,
  type SlotWidgetConfiguration,
  type WidgetAction
} from '../configuration-schema'
import { pagesOf, widgetsOf, type WidgetParent } from '../configuration-access'
import { BOARD_PROFILES, type SimCoreBoardId } from '../device'
import { MAXIMUM_HOLD_MS } from '../widget-conditions'

// Everything about how the document is put together: how many of each thing,
// how deep, whether a box lands on the display, and what a slot page and an
// action are allowed to say.

const WIDGET_POOL_CAPS: Record<string, number> = {
  text: MAXIMUM_TEXT_WIDGETS,
  shape: MAXIMUM_SHAPE_WIDGETS,
  bar: MAXIMUM_BAR_WIDGETS,
  arc: MAXIMUM_ARC_WIDGETS,
  indicator: MAXIMUM_INDICATOR_WIDGETS,
  graph: MAXIMUM_GRAPH_WIDGETS,
  image: MAXIMUM_IMAGE_WIDGETS,
  slot: MAXIMUM_SLOT_WIDGETS
}

// Undefined for a document naming no board, or one this configurator has no
// profile for; the display bound is then simply not checked here and the device
// answers instead.

function boardDisplay(
  configuration: ApplicationConfiguration
): { width: number; height: number } | undefined {
  const board = configuration.board as SimCoreBoardId | undefined
  return board ? BOARD_PROFILES[board]?.display : undefined
}

export type ValidationResult =
  | { ok: true; configuration: ApplicationConfiguration; payloadBytes: number }
  | { ok: false; error: string }

export interface ValidateOptions {
  /** Board identifiers this build supports; a document targeting another is rejected. */
  supportedBoards: readonly string[]
}

export function findScreenError(configuration: ApplicationConfiguration): string | undefined {
  const screens = configuration.dashboard?.screens
  if (screens === undefined) return undefined
  if (!Array.isArray(screens)) return '"dashboard.screens" must be an array of screens.'
  if (screens.length > MAXIMUM_SCREENS) {
    return `A dashboard carries at most ${MAXIMUM_SCREENS} screen(s); this one declares ${screens.length}.`
  }
  const screenIds = screens.map((screen) => screen?.id)
  const display = boardDisplay(configuration)
  let actions = 0
  const pool = new Map<string, number>()

  // One walk carrying where this parent sits and how deep it is, because both
  // are facts about the path rather than about the widget.
  const walk = (
    parent: WidgetParent,
    screenIndex: number,
    originX: number,
    originY: number,
    depth: number
  ): string | undefined => {
    const widgets = widgetsOf(parent)
    const cap = depth === 0 ? MAXIMUM_WIDGETS_PER_SCREEN : MAXIMUM_WIDGETS_PER_CONTAINER
    if (widgets.length > cap) {
      const where = depth === 0 ? `Screen ${screenIndex + 1}` : 'A container'
      return `${where} holds ${widgets.length} widgets; the device holds ${cap}.`
    }
    if (depth >= MAXIMUM_NESTING_DEPTH) {
      return `Containers are nested ${depth + 1} deep; the device nests ${MAXIMUM_NESTING_DEPTH}.`
    }
    for (const widget of widgets) {
      const label = `widget "${widget.id ?? ''}"`
      const error = findActionError(widget.action, screenIds, label)
      if (error) return error
      if (widget.action && widget.action.type !== 'none') actions += 1
      pool.set(widget.type, (pool.get(widget.type) ?? 0) + 1)

      // The one bound left: a container does not clip its children, so what a
      // box must still do is reach the display. Mirrors on_display() in
      // configuration_validation.cpp — reject only a box entirely outside it.
      const box = widget.placement
      if (box && display) {
        const left = originX + (box.x ?? 0)
        const top = originY + (box.y ?? 0)
        if (
          left + (box.width ?? 0) <= 0 ||
          top + (box.height ?? 0) <= 0 ||
          left >= display.width ||
          top >= display.height
        ) {
          return `Widget "${widget.id ?? ''}" sits entirely off the display.`
        }
      }

      if (widget.type === 'shape') {
        const nested = walk(
          widget,
          screenIndex,
          originX + (box?.x ?? 0),
          originY + (box?.y ?? 0),
          depth + 1
        )
        if (nested) return nested
        continue
      }

      if (widget.type !== 'slot') continue
      // A slot is built before every container that could hold one, so it is
      // only ever authored on a screen — the same rule the firmware parser
      // enforces, stated here so the editor says so before the device does.
      if (depth > 0) {
        return `${label} is a slot inside a container; a slot sits directly on a screen.`
      }
      const slotError = findSlotError(widget, label)
      if (slotError) return slotError
      for (const page of pagesOf(widget)) {
        // A page costs no nesting level, so its widgets sit exactly where a
        // container shape's would: one below the slot. The bound is about the
        // firmware parser's recursion, and a page adds none.
        const nested = walk(
          page,
          screenIndex,
          originX + (box?.x ?? 0),
          originY + (box?.y ?? 0),
          depth + 1
        )
        if (nested) return nested
      }
    }
    return undefined
  }

  for (const [screenIndex, screen] of screens.entries()) {
    const error = walk(screen, screenIndex, 0, 0, 0)
    if (error) return error
  }

  for (const [type, count] of pool) {
    const cap = WIDGET_POOL_CAPS[type]
    if (cap !== undefined && count > cap) {
      return `This dashboard uses ${count} ${type} widgets; the device stores ${cap}.`
    }
  }
  if (actions > MAXIMUM_ACTIONS) {
    return `This dashboard has ${actions} tap targets; the device binds at most ${MAXIMUM_ACTIONS}.`
  }
  return undefined
}

/**
 * Mirrors Validator::slot_widget and Validator::slot_page in
 * configuration_validation.cpp. A slot draws nothing, so anything that would
 * paint it is refused rather than ignored; and what a page's trigger needs is
 * stated per trigger, because a binding or a duration that nothing reads is how
 * an author comes to believe an alert works.
 */
function findSlotError(widget: SlotWidgetConfiguration, label: string): string | undefined {
  const painted =
    widget.background_color !== undefined ||
    widget.background_grad_color !== undefined ||
    (widget.border?.width_px ?? 0) > 0 ||
    (widget.border?.radius_px ?? 0) > 0 ||
    Boolean(widget.title?.text) ||
    (widget.conditions?.length ?? 0) > 0 ||
    Boolean(widget.condition_source?.binding)
  if (painted) {
    return `${label} is a slot with an appearance; a slot draws nothing, so put a shape behind it.`
  }
  if (widget.action && widget.action.type !== 'none') {
    return `${label} is a slot and also navigates; its tap already means "next page".`
  }
  const pages = pagesOf(widget)
  if (pages.length === 0) {
    return `${label} is a slot with no pages.`
  }
  if (pages.length > MAXIMUM_SLOT_PAGES) {
    return `${label} has ${pages.length} pages; the device holds ${MAXIMUM_SLOT_PAGES}.`
  }
  if (!pages.some((page) => page.in_loop !== false)) {
    return `${label} has no page in the loop, so nothing would bring one back after an event.`
  }
  for (const [index, page] of pages.entries()) {
    const where = `Page ${index + 1} of ${label}`
    const duration = page.duration_ms ?? 0
    const rules = page.conditions?.length ?? 0
    if (duration > MAXIMUM_HOLD_MS) {
      return `${where} stays up for ${duration} ms; the device holds one for ${MAXIMUM_HOLD_MS}.`
    }
    const trigger = page.trigger ?? 'none'
    if (trigger === 'none') {
      if (page.source?.binding || rules > 0 || duration > 0) {
        return `${where} has no trigger, so its telemetry, rules and duration would never be read.`
      }
      continue
    }
    if (!page.source?.binding) {
      return `${where} has a trigger but watches no telemetry.`
    }
    if (trigger === 'value_changed' && duration === 0) {
      return `${where} appears on a change but for no time at all; give it a duration.`
    }
    if (trigger === 'value_changed' && rules > 0) {
      return `${where} appears on a change, so its comparison rules would never be read.`
    }
    if (trigger === 'conditions' && rules === 0) {
      return `${where} appears on a comparison but has no rule to compare.`
    }
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
