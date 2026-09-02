import {
  MAXIMUM_SLOT_PAGES,
  MAXIMUM_VALUE_MODIFIERS,
  type SlotWidgetConfiguration,
  type WidgetAction,
  type WidgetConfiguration
} from '../configuration-schema'
import { isTextWidget, pagesOf, widgetSources } from '../configuration-access'
import { MAXIMUM_HOLD_MS } from '../widget-conditions'
import { t } from '../ui-text'

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
    Boolean(widget.title?.source?.binding) ||
    (widget.conditions?.length ?? 0) > 0 ||
    Boolean(widget.condition_source?.binding)
  if (painted) {
    return t('validation.widgetRules.labelIsASlotWith', { label: label })
  }
  if (widget.action && widget.action.type !== 'none') {
    return t('validation.widgetRules.labelIsASlotAnd', { label: label })
  }
  const pages = pagesOf(widget)
  if (pages.length === 0) {
    return t('validation.widgetRules.labelIsASlotWith2', { label: label })
  }
  if (pages.length > MAXIMUM_SLOT_PAGES) {
    return t('validation.widgetRules.labelHasLengthPagesThe', { label: label, length: pages.length, mAXIMUM_SLOT_PAGES: MAXIMUM_SLOT_PAGES })
  }
  if (!pages.some((page) => page.in_loop !== false)) {
    return t('validation.widgetRules.labelHasNoPageIn', { label: label })
  }
  for (const [index, page] of pages.entries()) {
    const where = `Page ${index + 1} of ${label}`
    const duration = page.duration_ms ?? 0
    const rules = page.conditions?.length ?? 0
    if (duration > MAXIMUM_HOLD_MS) {
      return t('validation.widgetRules.whereStaysUpForDuration', { where: where, duration: duration, mAXIMUM_HOLD_MS: MAXIMUM_HOLD_MS })
    }
    const trigger = page.trigger ?? 'none'
    if (trigger === 'none') {
      if (page.source?.binding || rules > 0 || duration > 0) {
        return t('validation.widgetRules.whereHasNoTriggerSo', { where: where })
      }
      continue
    }
    if (!page.source?.binding) {
      return t('validation.widgetRules.whereHasATriggerBut', { where: where })
    }
    if (trigger === 'value_changed' && duration === 0) {
      return t('validation.widgetRules.whereAppearsOnAChange', { where: where })
    }
    if (trigger === 'value_changed' && rules > 0) {
      return t('validation.widgetRules.whereAppearsOnAChange2', { where: where })
    }
    if (trigger === 'conditions' && rules === 0) {
      return t('validation.widgetRules.whereAppearsOnAComparison', { where: where })
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
    if (!action.screen) return t('validation.widgetRules.ownerNavigatesToAScreen', { owner: owner })
    if (!screenIds.includes(action.screen)) {
      return t('validation.widgetRules.ownerNavigatesToScreenScreen', { owner: owner, screen: action.screen })
    }
    return undefined
  }
  if (action.screen) {
    return t('validation.widgetRules.ownerNamesAScreenFor', { owner: owner, type: action.type ?? '' })
  }
  return undefined
}
