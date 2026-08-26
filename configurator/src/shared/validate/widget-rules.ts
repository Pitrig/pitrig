import {
  MAXIMUM_SLOT_PAGES,
  MAXIMUM_VALUE_MODIFIERS,
  type SlotWidgetConfiguration,
  type WidgetAction,
  type WidgetConfiguration
} from '../configuration-schema'
import { isTextWidget, pagesOf, widgetSources } from '../configuration-access'
import { MAXIMUM_HOLD_MS } from '../widget-conditions'

const LAP_TIMER_BINDING = 'session.lap.current_time'

export function countLapTimers(widget: WidgetConfiguration): number {
  if (!isTextWidget(widget)) return 0
  return (widget.sources ?? []).filter((source) =>
    source?.modifiers?.some((modifier) => modifier?.type === 'lap_timer')
  ).length
}

export function findModifierError(
  widget: WidgetConfiguration,
  label: string
): string | undefined {
  for (const [index, source] of widgetSources(widget).entries()) {
    const modifiers = source?.modifiers
    if (modifiers === undefined) continue
    if (!Array.isArray(modifiers)) {
      return `Source ${index + 1} of ${label} has a "modifiers" that is not an array.`
    }
    if (modifiers.length > MAXIMUM_VALUE_MODIFIERS) {
      return `Source ${index + 1} of ${label} has ${modifiers.length} modifiers; the device holds ${MAXIMUM_VALUE_MODIFIERS}.`
    }
  }
  if (!isTextWidget(widget)) return undefined
  for (const [index, source] of (widget.sources ?? []).entries()) {
    const lapTimers = (source?.modifiers ?? []).filter(
      (modifier) => modifier?.type === 'lap_timer'
    ).length
    if (lapTimers > 1) {
      return `Source ${index + 1} of ${label} uses the lap timer ${lapTimers} times; once is all it means.`
    }
    if (lapTimers === 1 && source?.binding !== LAP_TIMER_BINDING) {
      return `Source ${index + 1} of ${label} uses the lap timer on "${source?.binding ?? ''}"; it stands in for "${LAP_TIMER_BINDING}".`
    }
  }
  return undefined
}

export function findSlotError(widget: SlotWidgetConfiguration, label: string): string | undefined {
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

export function findActionError(
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
