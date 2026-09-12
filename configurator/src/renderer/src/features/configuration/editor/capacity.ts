import { WIDGET_POOL_CAPACITIES, allWidgetsOf, descendantsOf } from '@shared/configuration-access'
import { MAXIMUM_ACTIONS, type WidgetConfiguration } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { countLapTimers } from '@shared/validate/widget-rules'
import { t } from '@shared/ui-text'

type WidgetPool = Map<WidgetConfiguration['type'], number>

function pooled(widgets: readonly WidgetConfiguration[]): WidgetPool {
  const pool: WidgetPool = new Map()
  for (const widget of widgets) pool.set(widget.type, (pool.get(widget.type) ?? 0) + 1)
  return pool
}

function actionsOf(widgets: readonly WidgetConfiguration[]): number {
  return widgets.filter((widget) => widget.action && widget.action.type !== 'none').length
}

function lapTimersOf(widgets: readonly WidgetConfiguration[]): number {
  return widgets.reduce((total, widget) => total + countLapTimers(widget), 0)
}

export function insertionRefusal(
  configuration: DeviceConfiguration,
  widget: WidgetConfiguration
): string | undefined {
  const present = allWidgetsOf(configuration)
  const added = descendantsOf(widget)
  const held = pooled(present)
  for (const [type, count] of pooled(added)) {
    const total = (held.get(type) ?? 0) + count
    const cap = WIDGET_POOL_CAPACITIES[type]
    if (total > cap) {
      return t('validation.structure.thisDashboardUsesCountType', { count: total, type, cap })
    }
  }
  const actions = actionsOf(present) + actionsOf(added)
  if (actions > MAXIMUM_ACTIONS) {
    return t('validation.structure.thisDashboardHasActionsTap', {
      actions,
      mAXIMUM_ACTIONS: MAXIMUM_ACTIONS
    })
  }
  const lapTimers = lapTimersOf(present) + lapTimersOf(added)
  if (lapTimers > 1) {
    return t('validation.structure.thisDashboardHasLaptimersSources', { lapTimers })
  }
  return undefined
}
