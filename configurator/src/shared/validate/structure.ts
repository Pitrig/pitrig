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
      if (depth > 0) {
        return `${label} is a slot inside a container; a slot sits directly on a screen.`
      }
      const slotError = findSlotError(widget, label)
      if (slotError) return slotError
      for (const page of pagesOf(widget)) {
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
  if (lapTimers > 1) {
    return `This dashboard has ${lapTimers} sources using the lap timer; the device runs one.`
  }
  return undefined
}
