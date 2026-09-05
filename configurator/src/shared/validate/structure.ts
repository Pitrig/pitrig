import {
  MAXIMUM_ACTIONS,
  MAXIMUM_NESTING_DEPTH,
  MAXIMUM_SCREENS,
  MAXIMUM_WIDGETS_PER_CONTAINER,
  MAXIMUM_WIDGETS_PER_SCREEN,
  type ApplicationConfiguration,
  type WidgetConfiguration
} from '../configuration-schema'
import {
  WIDGET_POOL_CAPACITIES,
  pagesOf,
  widgetsOf,
  type WidgetParent
} from '../configuration-access'
import { BOARD_PROFILES, type PitrigBoardId } from '../device'
import {
  countLapTimers,
  findActionError,
  findModifierError,
  findSlotError
} from './widget-rules'
import { findWidgetGeometryError } from './widget-geometry'
import { findWidgetValueError } from './widget-values'
import { t } from '../ui-text'

function boardDisplay(
  configuration: ApplicationConfiguration
): { width: number; height: number } | undefined {
  const board = configuration.board as PitrigBoardId | undefined
  return board ? BOARD_PROFILES[board]?.display : undefined
}

export function findScreenError(configuration: ApplicationConfiguration): string | undefined {
  const screens = configuration.dashboard?.screens
  if (screens === undefined) return undefined
  if (!Array.isArray(screens)) return t('validation.structure.dashboardScreensMustBeAn')
  if (screens.length > MAXIMUM_SCREENS) {
    return t('validation.structure.aDashboardCarriesAtMost', { mAXIMUM_SCREENS: MAXIMUM_SCREENS, length: screens.length })
  }
  const board = configuration.board as PitrigBoardId | undefined
  if (screens.length > 0 && board && BOARD_PROFILES[board] && !BOARD_PROFILES[board].display) {
    return t('validation.structure.thisBoardHasNoDisplay')
  }
  const screenIds = screens.map((screen) => screen?.id)
  const display = boardDisplay(configuration)
  let actions = 0
  const pool = new Map<WidgetConfiguration['type'], number>()
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
      const where = depth === 0 ? `Screen ${screenIndex + 1}` : t('validation.structure.aContainer')
      return t('validation.structure.whereHoldsLengthWidgetsThe', { where: where, length: widgets.length, cap: cap })
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
        return t('validation.structure.labelIsASlotInside', { label: label })
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
    const cap = WIDGET_POOL_CAPACITIES[type]
    if (count > cap) {
      return t('validation.structure.thisDashboardUsesCountType', { count: count, type: type, cap: cap })
    }
  }
  if (actions > MAXIMUM_ACTIONS) {
    return t('validation.structure.thisDashboardHasActionsTap', { actions: actions, mAXIMUM_ACTIONS: MAXIMUM_ACTIONS })
  }
  if (lapTimers > 1) {
    return t('validation.structure.thisDashboardHasLaptimersSources', { lapTimers: lapTimers })
  }
  return undefined
}
