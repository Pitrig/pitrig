import {
  INPUT_NAME_CAPACITY,
  MAXIMUM_CONTROL_BINDINGS,
  MAXIMUM_CONTROL_RULES,
  MAXIMUM_INPUT_BUTTONS,
  MAXIMUM_INPUT_SOURCES,
  MAXIMUM_SWITCH_POSITIONS,
  type ControlAction,
  type ControlBinding,
  type ControlRule,
  type ControlsConfiguration,
  type InputButton,
  type InputSource,
  type InputsConfiguration
} from '@shared/configuration-schema'
import { allWidgetsOf, arrayOf, pagesOf, screensOf } from '@shared/configuration-access'
import {
  PAGE_ACTIONS,
  REPEAT_ACTIONS,
  SCREEN_ACTIONS,
  SLOT_ACTIONS,
  WRAP_ACTIONS
} from '@shared/control-actions'
import { BOARD_PROFILES, type DeviceConfiguration, type PitrigBoardId } from '@shared/device'
import { t } from '@shared/ui-text'
import { mutateDraftConfiguration } from '@/features/configuration/dashboard-editor'

export type InputTarget = { kind: 'button'; index: number } | { kind: 'position'; index: number }

export interface SlotChoice {
  id: string
  pages: number
}

const DEFAULT_RULE_BINDING = 'vehicle.in_pit_lane'
const PLUGIN_PREFIX = /^[A-Za-z]+Plugin\./

export function inputLabel(id: string): string {
  return id.replace(PLUGIN_PREFIX, '').replace(/_/g, ' ')
}

export function inputButtonsOf(draft: DeviceConfiguration | undefined): readonly InputButton[] {
  return arrayOf(draft?.inputs?.buttons)
}

export function switchPositionsOf(draft: DeviceConfiguration | undefined): readonly InputSource[] {
  return arrayOf(draft?.inputs?.switch?.positions)
}

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

export function buttonLabel(buttons: readonly InputButton[], index: number): string {
  const name = buttons[index]?.name?.trim()
  const number = t('controls.document.buttonNumber', { number: index + 1 })
  return name && name !== number ? `${number} · ${name}` : number
}

function emptyButton(button: InputButton | undefined): boolean {
  return !button?.name && arrayOf(button?.sources).length === 0
}

function prunedInputs(inputs: InputsConfiguration): InputsConfiguration | undefined {
  const buttons = arrayOf(inputs.buttons).map((button) => {
    const next: InputButton = {}
    if (button.name) next.name = button.name
    const sources = arrayOf(button.sources).filter((source) => source.id)
    if (sources.length > 0) next.sources = [...sources]
    return next
  })
  while (buttons.length > 0 && emptyButton(buttons[buttons.length - 1])) buttons.pop()
  const positions = arrayOf(inputs.switch?.positions).map((source) => (source.id ? { id: source.id } : {}))
  while (positions.length > 0 && !positions[positions.length - 1]?.id) positions.pop()
  const pruned: InputsConfiguration = {}
  if (buttons.length > 0) pruned.buttons = buttons
  if (positions.length > 0) pruned.switch = { positions }
  return Object.keys(pruned).length > 0 ? pruned : undefined
}

function mutateInputs(mutation: (inputs: InputsConfiguration) => void): void {
  mutateDraftConfiguration((configuration) => {
    const inputs: InputsConfiguration = configuration.inputs ?? {}
    mutation(inputs)
    const pruned = prunedInputs(inputs)
    if (pruned) configuration.inputs = pruned
    else delete configuration.inputs
  })
}

function withoutInput(inputs: InputsConfiguration, id: string): void {
  for (const button of inputs.buttons ?? []) {
    button.sources = arrayOf(button.sources).filter((source) => source.id !== id)
  }
  for (const position of inputs.switch?.positions ?? []) {
    if (position.id === id) delete position.id
  }
}

export function assignInput(target: InputTarget, id: string): void {
  mutateInputs((inputs) => {
    withoutInput(inputs, id)
    if (target.kind === 'button') {
      if (target.index >= MAXIMUM_INPUT_BUTTONS) return
      const buttons = inputs.buttons ?? []
      while (buttons.length <= target.index) buttons.push({})
      const button = buttons[target.index] ?? {}
      const sources = [...arrayOf(button.sources)]
      if (sources.length >= MAXIMUM_INPUT_SOURCES) sources.shift()
      sources.push({ id })
      button.sources = sources
      buttons[target.index] = button
      inputs.buttons = buttons
      return
    }
    if (target.index >= MAXIMUM_SWITCH_POSITIONS) return
    const positions = inputs.switch?.positions ?? []
    while (positions.length <= target.index) positions.push({})
    positions[target.index] = { id }
    inputs.switch = { positions }
  })
}

export function removeInput(id: string): void {
  mutateInputs((inputs) => withoutInput(inputs, id))
}

export function renameButton(index: number, name: string): void {
  mutateInputs((inputs) => {
    const buttons = inputs.buttons ?? []
    while (buttons.length <= index) buttons.push({})
    const button = buttons[index] ?? {}
    const trimmed = name.slice(0, INPUT_NAME_CAPACITY - 1)
    if (trimmed) button.name = trimmed
    else delete button.name
    buttons[index] = button
    inputs.buttons = buttons
  })
}

export function addButton(draft: DeviceConfiguration | undefined): number | undefined {
  const buttons = inputButtonsOf(draft)
  const free = buttons.findIndex((button) => emptyButton(button))
  const index = free >= 0 ? free : buttons.length
  if (index >= MAXIMUM_INPUT_BUTTONS) return undefined
  renameButton(index, t('controls.document.buttonNumber', { number: index + 1 }))
  return index
}

export function clearButton(index: number): void {
  mutateInputs((inputs) => {
    const buttons = inputs.buttons ?? []
    if (index < buttons.length) buttons[index] = {}
  })
}

export function removePosition(index: number): void {
  mutateInputs((inputs) => {
    const positions = inputs.switch?.positions ?? []
    if (index === positions.length - 1) positions.pop()
    else if (positions[index]) positions[index] = {}
  })
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

function mutateControls(mutation: (controls: ControlsConfiguration, draft: DeviceConfiguration) => void): void {
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

export function boardHasDisplay(draft: DeviceConfiguration | undefined): boolean {
  const board = draft?.board as PitrigBoardId | undefined
  return Boolean(board && BOARD_PROFILES[board]?.display)
}

export function applyAction(binding: ControlBinding, action: ControlAction, draft: DeviceConfiguration): void {
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
