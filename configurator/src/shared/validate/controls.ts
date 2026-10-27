import {
  CONDITION_OPERATOR_VALUES,
  CONTROL_ACTION_VALUES,
  FIELD_RANGES,
  MAXIMUM_CONTROL_BINDINGS,
  MAXIMUM_CONTROL_RULES,
  MAXIMUM_IDLE_RETURN_MS,
  MAXIMUM_INPUT_BUTTONS,
  MAXIMUM_INPUT_SOURCES,
  MAXIMUM_SWITCH_POSITIONS,
  MAXIMUM_WIDGET_CONDITIONS,
  type ApplicationConfiguration,
  type ControlBinding,
  type ControlRule,
  type FieldRange
} from '../configuration-schema'
import { allWidgetsOf, arrayOf, pagesOf, screensOf } from '../configuration-access'
import { PAGE_ACTIONS, SCREEN_ACTIONS, SLOT_ACTIONS } from '../control-actions'
import { t } from '../ui-text'
import { findBoundError } from './ranges'
import { badBinding, badEnum, badList } from './values'

const CONTROL_RANGES: readonly FieldRange[] = [
  { key: 'home_after_ms', minimum: 0, maximum: MAXIMUM_IDLE_RETURN_MS }
]

interface Targets {
  screens: ReadonlySet<string>
  slots: ReadonlyMap<string, number>
}

function targetsOf(configuration: ApplicationConfiguration): Targets {
  const screens = new Set(screensOf(configuration).flatMap((screen) => (screen.id ? [screen.id] : [])))
  const slots = new Map<string, number>()
  for (const widget of allWidgetsOf(configuration)) {
    if (widget.type === 'slot' && widget.id) slots.set(widget.id, pagesOf(widget).length)
  }
  return { screens, slots }
}

function findInputsError(configuration: ApplicationConfiguration): string | undefined {
  const label = t('validation.controls.thePcButtons')
  const inputs = configuration.inputs
  const listError =
    badList(inputs?.buttons, MAXIMUM_INPUT_BUTTONS, label, 'buttons') ??
    badList(inputs?.switch?.positions, MAXIMUM_SWITCH_POSITIONS, label, 'switch.positions')
  if (listError) return listError
  for (const [index, button] of arrayOf(inputs?.buttons).entries()) {
    const owner = t('controls.document.buttonNumber', { number: index + 1 })
    const error = badList(button.sources, MAXIMUM_INPUT_SOURCES, owner, 'sources')
    if (error) return error
  }
  return undefined
}

function findBindingError(binding: ControlBinding, number: number, targets: Targets): string | undefined {
  const owner = t('validation.controls.actionNumber', { number })
  const enumError = badEnum(binding.action, CONTROL_ACTION_VALUES, owner, 'action')
  if (enumError) return enumError
  const rangeError = findBoundError(binding, FIELD_RANGES.ControlBinding, owner)
  if (rangeError) return rangeError
  const action = binding.action ?? 'next_screen'
  const screen = binding.screen ?? ''
  const slot = binding.slot ?? ''
  if (SCREEN_ACTIONS.has(action) && !targets.screens.has(screen)) {
    return t('validation.controls.ownerShowsAScreenThe', { owner, screen })
  }
  if (!SCREEN_ACTIONS.has(action) && screen) {
    return t('validation.controls.ownerNamesAScreenIt', { owner, action })
  }
  if (!SLOT_ACTIONS.has(action)) {
    return slot ? t('validation.controls.ownerNamesASlotIt', { owner, action }) : undefined
  }
  const pages = targets.slots.get(slot)
  if (pages === undefined) return t('validation.controls.ownerWorksOnASlot', { owner, slot })
  const page = binding.page ?? 1
  if (PAGE_ACTIONS.has(action) && page > pages) {
    return t('validation.controls.ownerShowsPageOfA', { owner, page, slot, pages })
  }
  return undefined
}

function findRuleError(rule: ControlRule, number: number, targets: Targets): string | undefined {
  const owner = t('validation.controls.screenRuleNumber', { number })
  if (!targets.screens.has(rule.screen ?? '')) {
    return t('validation.controls.ownerShowsAScreenThe', { owner, screen: rule.screen ?? '' })
  }
  const bindingError = badBinding(rule.source?.binding, '', owner, t('validation.widgetValues.theSource'))
  if (bindingError) return bindingError
  if (arrayOf(rule.source?.modifiers).length > 0) return t('validation.controls.ownerWatchesALapTimer', { owner })
  const listError = badList(rule.conditions, MAXIMUM_WIDGET_CONDITIONS, owner, 'conditions')
  if (listError) return listError
  const conditions = arrayOf(rule.conditions)
  if (conditions.length === 0) return t('validation.controls.ownerHasNoComparison', { owner })
  for (const [index, condition] of conditions.entries()) {
    const error = badEnum(condition.op, CONDITION_OPERATOR_VALUES, owner, `conditions[${index}].op`)
    if (error) return error
    if (condition.value !== undefined && !Number.isFinite(condition.value)) {
      return t('validation.ledValues.labelSetsKeyToSomething', { label: owner, key: `conditions[${index}].value` })
    }
  }
  return undefined
}

function findDashboardControlsError(configuration: ApplicationConfiguration): string | undefined {
  const controls = configuration.dashboard?.controls
  if (!controls) return undefined
  const label = t('validation.controls.theDashboardSControls')
  const listError =
    badList(controls.bindings, MAXIMUM_CONTROL_BINDINGS, label, 'bindings') ??
    badList(controls.rules, MAXIMUM_CONTROL_RULES, label, 'rules')
  if (listError) return listError
  const rangeError = findBoundError(controls, CONTROL_RANGES, label)
  if (rangeError) return rangeError
  const targets = targetsOf(configuration)
  for (const [index, binding] of arrayOf(controls.bindings).entries()) {
    const error = findBindingError(binding, index + 1, targets)
    if (error) return error
  }
  const switched = controls.switch?.slot ?? ''
  if (switched && !targets.slots.has(switched)) {
    return t('validation.controls.theSwitchTurnsSlotSlot', { slot: switched })
  }
  const home = controls.home_screen ?? ''
  if (home && !targets.screens.has(home)) {
    return t('validation.controls.theHomeScreenScreenIs', { screen: home })
  }
  for (const [index, rule] of arrayOf(controls.rules).entries()) {
    const error = findRuleError(rule, index + 1, targets)
    if (error) return error
  }
  return undefined
}

export function findControlsError(configuration: ApplicationConfiguration): string | undefined {
  return findInputsError(configuration) ?? findDashboardControlsError(configuration)
}
