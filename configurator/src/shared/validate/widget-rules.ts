import {
  MAXIMUM_SLOT_PAGES,
  MAXIMUM_VALUE_MODIFIERS,
  MAXIMUM_WIDGET_CONDITIONS,
  type SlotPageConfiguration,
  type SlotWidgetConfiguration,
  type WidgetAction,
  type WidgetConfiguration
} from '../configuration-schema'
import { arrayOf, pagesOf, widgetSources } from '../configuration-access'
import { MAXIMUM_HOLD_MS } from '../widget-conditions'
import { badBinding, badList } from './values'
import { t } from '../ui-text'

const LAP_TIMER_BINDING = 'session.lap.current_time'

function lapTimersOf(modifiers: unknown): number {
  return arrayOf(modifiers as { type?: string }[] | undefined).filter(
    (modifier) => modifier?.type === 'lap_timer'
  ).length
}

export function countLapTimers(widget: WidgetConfiguration): number {
  return widgetSources(widget).filter((source) => lapTimersOf(source?.modifiers) > 0).length
}

export function findModifierError(
  widget: WidgetConfiguration,
  label: string
): string | undefined {
  for (const [index, source] of widgetSources(widget).entries()) {
    const modifiers = source?.modifiers
    if (modifiers === undefined) continue
    if (!Array.isArray(modifiers)) {
      return t('validation.widgetRules.sourceOfLabelHasAModifiers', { number: index + 1, label })
    }
    if (modifiers.length > MAXIMUM_VALUE_MODIFIERS) {
      return t('validation.widgetRules.sourceOfLabelHasLengthModifiers', { number: index + 1, label, length: modifiers.length, maximum: MAXIMUM_VALUE_MODIFIERS })
    }
    const lapTimers = lapTimersOf(modifiers)
    if (lapTimers > 1) {
      return t('validation.widgetRules.sourceOfLabelUsesTheLap', { number: index + 1, label, lapTimers })
    }
    if (lapTimers === 1 && source?.binding !== LAP_TIMER_BINDING) {
      return t('validation.widgetRules.sourceOfLabelUsesTheLap2', { number: index + 1, label, binding: source?.binding ?? '', lapTimer: LAP_TIMER_BINDING })
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
  if (widget.action && (widget.action.type ?? 'none') !== 'none') {
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
    const error = findSlotPageError(page, t('validation.ranges.pageOfLabel', { number: index + 1, label }))
    if (error) return error
  }
  return undefined
}

function findSlotPageError(page: SlotPageConfiguration, where: string): string | undefined {
  const listError = badList(page.conditions, MAXIMUM_WIDGET_CONDITIONS, where, 'rules')
  if (listError) return listError
  const duration = page.duration_ms ?? 0
  const rules = arrayOf(page.conditions).length
  if (duration > MAXIMUM_HOLD_MS) {
    return t('validation.widgetRules.whereStaysUpForDuration', { where: where, duration: duration, mAXIMUM_HOLD_MS: MAXIMUM_HOLD_MS })
  }
  const trigger = page.trigger ?? 'none'
  if (trigger === 'none') {
    return page.source?.binding || rules > 0 || duration > 0
      ? t('validation.widgetRules.whereHasNoTriggerSo', { where: where })
      : undefined
  }
  if (!page.source?.binding) {
    return t('validation.widgetRules.whereHasATriggerBut', { where: where })
  }
  const unknown = badBinding(page.source.binding, '', where, t('validation.widgetValues.theSource'))
  if (unknown) return unknown
  if (trigger === 'value_changed' && duration === 0) {
    return t('validation.widgetRules.whereAppearsOnAChange', { where: where })
  }
  if (trigger === 'value_changed' && rules > 0) {
    return t('validation.widgetRules.whereAppearsOnAChange2', { where: where })
  }
  if (trigger === 'conditions' && rules === 0) {
    return t('validation.widgetRules.whereAppearsOnAComparison', { where: where })
  }
  return undefined
}

export function findActionError(
  action: WidgetAction | undefined,
  screenIds: readonly (string | undefined)[],
  owner: string
): string | undefined {
  if (!action) return undefined
  const type = action.type ?? 'none'
  if (type === 'goto_screen') {
    if (!action.screen) return t('validation.widgetRules.ownerNavigatesToAScreen', { owner: owner })
    if (!screenIds.includes(action.screen)) {
      return t('validation.widgetRules.ownerNavigatesToScreenScreen', { owner: owner, screen: action.screen })
    }
    return undefined
  }
  if (action.screen) {
    return t('validation.widgetRules.ownerNamesAScreenFor', { owner: owner, type: type })
  }
  return undefined
}
