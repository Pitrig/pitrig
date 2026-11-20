import {
  MAXIMUM_CONTROL_BINDINGS,
  MAXIMUM_CONTROL_RULES,
  type ControlAction,
  type ControlBinding,
  type ControlRule,
  type ControlsConfiguration
} from '@shared/configuration-schema'
import { allWidgetsOf, arrayOf, pagesOf, screensOf } from '@shared/configuration-access'
import {
  PAGE_ACTIONS,
  REPEAT_ACTIONS,
  SCREEN_ACTIONS,
  SLOT_ACTIONS,
  WRAP_ACTIONS
} from '@shared/control-actions'
import type { DeviceConfiguration } from '@shared/device'
import { mutateDraftConfiguration } from './document'

export interface SlotChoice {
  id: string
  pages: number
}

const DEFAULT_RULE_BINDING = 'vehicle.in_pit_lane'

export function controlsOf(draft: DeviceConfiguration | undefined): ControlsConfiguration {
  return draft?.dashboard?.controls ?? {}
}

export function screenIdsOf(draft: DeviceConfiguration | undefined): string[] {
  return screensOf(draft).flatMap((screen) => (screen.id ? [screen.id] : []))
}

export function slotChoicesOf(draft: DeviceConfiguration | undefined): SlotChoice[] {
  return allWidgetsOf(draft).flatMap((widget) =>
    widget.type === 'slot' && widget.id ? [{ id: widget.id, pages: pagesOf(widget).length }] : []
  )
}

function prunedControls(controls: ControlsConfiguration): ControlsConfiguration | undefined {
  const pruned: ControlsConfiguration = {}
  if (arrayOf(controls.bindings).length > 0) pruned.bindings = [...arrayOf(controls.bindings)]
  if (controls.switch?.slot) pruned.switch = { slot: controls.switch.slot }
  if (arrayOf(controls.rules).length > 0) pruned.rules = [...arrayOf(controls.rules)]
  if (controls.home_screen) pruned.home_screen = controls.home_screen
  if (controls.home_after_ms) pruned.home_after_ms = controls.home_after_ms
  return Object.keys(pruned).length > 0 ? pruned : undefined
}

function mutateControls(
  mutation: (controls: ControlsConfiguration, draft: DeviceConfiguration) => void
): void {
  mutateDraftConfiguration((configuration) => {
    const dashboard = configuration.dashboard ?? {}
    const controls: ControlsConfiguration = dashboard.controls ?? {}
    mutation(controls, configuration)
    const pruned = prunedControls(controls)
    if (pruned) dashboard.controls = pruned
    else delete dashboard.controls
    if (Object.keys(dashboard).length > 0) configuration.dashboard = dashboard
    else delete configuration.dashboard
  })
}

export function applyAction(
  binding: ControlBinding,
  action: ControlAction,
  draft: DeviceConfiguration
): void {
  binding.action = action
  if (SCREEN_ACTIONS.has(action)) binding.screen = binding.screen || (screenIdsOf(draft)[0] ?? '')
  else delete binding.screen
  if (SLOT_ACTIONS.has(action)) binding.slot = binding.slot || (slotChoicesOf(draft)[0]?.id ?? '')
  else delete binding.slot
  if (!PAGE_ACTIONS.has(action)) delete binding.page
  if (!WRAP_ACTIONS.has(action)) delete binding.wrap
  if (!REPEAT_ACTIONS.has(action)) delete binding.repeat
}

export function addBinding(button: number, action: ControlAction): void {
  mutateControls((controls, draft) => {
    const bindings = controls.bindings ?? []
    if (bindings.length >= MAXIMUM_CONTROL_BINDINGS) return
    const binding: ControlBinding = { button }
    applyAction(binding, action, draft)
    bindings.push(binding)
    controls.bindings = bindings
  })
}

export function changeBinding(
  index: number,
  mutation: (binding: ControlBinding, draft: DeviceConfiguration) => void
): void {
  mutateControls((controls, draft) => {
    const binding = controls.bindings?.[index]
    if (binding) mutation(binding, draft)
  })
}

export function removeBinding(index: number): void {
  mutateControls((controls) => {
    controls.bindings = arrayOf(controls.bindings).filter((_, at) => at !== index)
  })
}

export function removeBindingsOf(button: number): void {
  mutateControls((controls) => {
    controls.bindings = arrayOf(controls.bindings).filter(
      (binding) => (binding.button ?? 1) !== button
    )
  })
}

export function setSwitchSlot(slot: string): void {
  mutateControls((controls) => {
    controls.switch = slot ? { slot } : {}
  })
}

export function setHomeScreen(screen: string): void {
  mutateControls((controls) => {
    if (screen) controls.home_screen = screen
    else delete controls.home_screen
  })
}

export function setHomeAfter(milliseconds: number): void {
  mutateControls((controls) => {
    if (milliseconds > 0) controls.home_after_ms = milliseconds
    else delete controls.home_after_ms
  })
}

export function addRule(draft: DeviceConfiguration | undefined): void {
  const screens = screenIdsOf(draft)
  const screen = screens[1] ?? screens[0]
  if (!screen) return
  mutateControls((controls) => {
    const rules = controls.rules ?? []
    if (rules.length >= MAXIMUM_CONTROL_RULES) return
    rules.push({
      screen,
      source: { binding: DEFAULT_RULE_BINDING },
      conditions: [{ op: 'equal', value: 1 }]
    })
    controls.rules = rules
  })
}

export function changeRule(index: number, mutation: (rule: ControlRule) => void): void {
  mutateControls((controls) => {
    const rule = controls.rules?.[index]
    if (rule) mutation(rule)
  })
}

export function removeRule(index: number): void {
  mutateControls((controls) => {
    controls.rules = arrayOf(controls.rules).filter((_, at) => at !== index)
  })
}
