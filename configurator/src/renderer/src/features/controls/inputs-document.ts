import {
  INPUT_NAME_CAPACITY,
  MAXIMUM_INPUT_BUTTONS,
  MAXIMUM_INPUT_SOURCES,
  MAXIMUM_SWITCH_POSITIONS,
  type InputButton,
  type InputSource,
  type InputsConfiguration
} from '@shared/configuration-schema'
import { arrayOf } from '@shared/configuration-access'
import { BOARD_PROFILES, type DeviceConfiguration, type PitrigBoardId } from '@shared/device'
import { t } from '@shared/ui-text'
import { controlsOf, mutateDraftConfiguration } from '@/features/configuration/dashboard-editor'

export type InputTarget = { kind: 'button'; index: number } | { kind: 'position'; index: number }

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

export function boardHasDisplay(draft: DeviceConfiguration | undefined): boolean {
  const board = draft?.board as PitrigBoardId | undefined
  return Boolean(board && BOARD_PROFILES[board]?.display)
}

function emptyButton(button: InputButton | undefined): boolean {
  return !button?.name && arrayOf(button?.sources).length === 0
}

export function buttonIndicesOf(draft: DeviceConfiguration | undefined): number[] {
  const used = new Set<number>()
  inputButtonsOf(draft).forEach((button, index) => {
    if (!emptyButton(button)) used.add(index)
  })
  for (const binding of arrayOf(controlsOf(draft).bindings)) {
    const index = (binding.button ?? 1) - 1
    if (index >= 0 && index < MAXIMUM_INPUT_BUTTONS) used.add(index)
  }
  return [...used].sort((left, right) => left - right)
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
  const used = new Set(buttonIndicesOf(draft))
  for (let index = 0; index < MAXIMUM_INPUT_BUTTONS; index += 1) {
    if (used.has(index)) continue
    renameButton(index, t('controls.document.buttonNumber', { number: index + 1 }))
    return index
  }
  return undefined
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
