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
  MAXIMUM_SLOT_WIDGETS,
  MAXIMUM_TEXT_WIDGETS,
  MAXIMUM_WIDGETS_PER_CONTAINER,
  MAXIMUM_WIDGETS_PER_SCREEN,
  type ApplicationConfiguration
} from '../configuration-schema'
import { pagesOf, widgetsOf, type WidgetParent } from '../configuration-access'
import { BOARD_PROFILES, type SimCoreBoardId } from '../device'
import {
  countLapTimers,
  findActionError,
  findModifierError,
  findSlotError
} from './widget-rules'
import { findWidgetGeometryError } from './widget-geometry'
import { findWidgetValueError } from './widget-values'

// Everything about how the document is put together: how many of each thing,
// how deep, and whether a box lands on the display. What one widget's own
// properties may say is widget-rules.ts.

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
  let lapTimers = 0

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
    // What the device bounds is the depth a *widget* sits at, not the depth a
    // container reaches: an empty container on the last level is a plain drawn
    // rectangle and the firmware accepts it. So this fires on the array having
    // something in it rather than on the recursion arriving.
    if (widgets.length > 0 && depth >= MAXIMUM_NESTING_DEPTH) {
      return `Containers are nested ${depth + 1} deep; the device nests ${MAXIMUM_NESTING_DEPTH}.`
    }
    for (const widget of widgets) {
      const label = `widget "${widget.id ?? ''}"`
      const modifierError = findModifierError(widget, label)
      if (modifierError) return modifierError
      const valueError = findWidgetValueError(widget, label)
      if (valueError) return valueError
      const geometryError = findWidgetGeometryError(widget, label, display)
      if (geometryError) return geometryError
      lapTimers += countLapTimers(widget)
      const error = findActionError(widget.action, screenIds, label)
      if (error) return error
      if (widget.action && widget.action.type !== 'none') actions += 1
      pool.set(widget.type, (pool.get(widget.type) ?? 0) + 1)

      // The one bound left: a container does not clip its children, so what a
      // box must still do is reach the display. Mirrors on_display() in
      // configuration_validation.cpp — reject only a box entirely outside it.
      // An absent placement is not an exemption: every field defaults to zero
      // on the device, which is a box of no size at the origin, and that is
      // what on_display() then refuses.
      const box = widget.placement ?? {}
      if (display) {
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
  // One Lap Timer module instance backs every lap_timer modifier, so the whole
  // dashboard claims it once. Mirrors the tally at the end of
  // configuration_validation.cpp.
  if (lapTimers > 1) {
    return `This dashboard has ${lapTimers} sources using the lap timer; the device runs one.`
  }
  return undefined
}
