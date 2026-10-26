import {
  MAXIMUM_CONTROL_BINDINGS,
  MAXIMUM_INPUT_BUTTONS,
  type ControlAction,
  type ControlBinding
} from '@shared/configuration-schema'
import { arrayOf } from '@shared/configuration-access'
import {
  PAGE_ACTIONS,
  REPEAT_ACTIONS,
  SCREEN_ACTIONS,
  SLOT_ACTIONS,
  WRAP_ACTIONS,
  actionsFor
} from '@shared/control-actions'
import { t } from '@shared/ui-text'
import { cn } from '@/lib/utils'
import { Select } from '@/components/ui/select'
import { useDeviceStore } from '@/features/device/device-store'
import { CONTROL } from '@/features/configuration/inspector/fields'
import { AddButton, RemoveButton } from '@/features/configuration/inspector/widget-editors'
import {
  addBinding,
  applyAction,
  boardHasDisplay,
  buttonLabel,
  changeBinding,
  controlsOf,
  inputButtonsOf,
  removeBinding,
  screenIdsOf,
  slotChoicesOf,
  type SlotChoice
} from './controls-document'
import { Lamp } from './input-parts'
import { buttonLit, useInputTester } from './input-tester'

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <label className="flex flex-none items-center gap-1 text-muted-foreground">
      <input
        type="checkbox"
        className="size-3.5"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

function Target({
  binding,
  index,
  screens,
  slots
}: {
  binding: ControlBinding
  index: number
  screens: readonly string[]
  slots: readonly SlotChoice[]
}): React.JSX.Element | null {
  const action = binding.action ?? 'next_screen'
  if (SCREEN_ACTIONS.has(action)) {
    return (
      <Select
        className={cn(CONTROL, 'w-32')}
        aria-label={t('controls.bindingList.screen')}
        value={binding.screen ?? ''}
        options={screens.map((screen) => ({ value: screen, label: screen }))}
        onChange={(screen) => changeBinding(index, (next) => { next.screen = screen })}
      />
    )
  }
  if (!SLOT_ACTIONS.has(action)) return null
  const pages = slots.find((choice) => choice.id === binding.slot)?.pages ?? 1
  return (
    <>
      <Select
        className={cn(CONTROL, 'w-32')}
        aria-label={t('controls.bindingList.slot')}
        value={binding.slot ?? ''}
        options={slots.map((choice) => ({ value: choice.id, label: choice.id }))}
        onChange={(slot) => changeBinding(index, (next) => { next.slot = slot })}
      />
      {PAGE_ACTIONS.has(action) ? (
        <Select
          className={cn(CONTROL, 'w-24')}
          aria-label={t('controls.bindingList.page')}
          value={binding.page ?? 1}
          options={Array.from({ length: Math.max(pages, 1) }, (_, page) => ({
            value: page + 1,
            label: t('controls.bindingList.pageNumber', { number: page + 1 })
          }))}
          onChange={(page) => changeBinding(index, (next) => { next.page = page })}
        />
      ) : null}
    </>
  )
}

function firstUnbound(wired: number, bindings: readonly ControlBinding[]): number {
  for (let button = 1; button <= wired; button += 1) {
    if (!bindings.some((binding) => (binding.button ?? 1) === button)) return button
  }
  return 1
}

export function BindingList(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const tester = useInputTester()
  const bindings = arrayOf(controlsOf(draft).bindings)
  const buttons = inputButtonsOf(draft)
  const screens = screenIdsOf(draft)
  const slots = slotChoicesOf(draft)
  const actions = actionsFor(boardHasDisplay(draft))
  const buttonOptions = Array.from({ length: MAXIMUM_INPUT_BUTTONS }, (_, button) => ({
    value: button + 1,
    label: buttonLabel(buttons, button)
  }))
  const blocked = (action: ControlAction): boolean =>
    (SCREEN_ACTIONS.has(action) && screens.length === 0) || (SLOT_ACTIONS.has(action) && slots.length === 0)
  return (
    <div className="space-y-1.5">
      {bindings.length === 0 ? (
        <p className="text-muted-foreground">{t('controls.bindingList.noActionsYet')}</p>
      ) : null}
      {bindings.map((binding, index) => {
        const button = binding.button ?? 1
        const action = binding.action ?? 'next_screen'
        return (
          <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5">
            <Lamp lit={buttonLit(tester, button - 1, buttons[button - 1])} />
            <Select
              className={cn(CONTROL, 'w-40')}
              aria-label={t('controls.bindingList.button')}
              value={button}
              options={buttonOptions}
              onChange={(next) => changeBinding(index, (target) => { target.button = next })}
            />
            <Select
              className={cn(CONTROL, 'w-44')}
              aria-label={t('controls.bindingList.action')}
              value={action}
              options={actions.map((candidate) => ({
                value: candidate,
                label: t(`controls.actions.${candidate}`),
                disabled: blocked(candidate)
              }))}
              onChange={(next) => changeBinding(index, (target, current) => applyAction(target, next, current))}
            />
            <Target binding={binding} index={index} screens={screens} slots={slots} />
            {WRAP_ACTIONS.has(action) ? (
              <Toggle
                label={t('controls.bindingList.wrap')}
                checked={binding.wrap ?? true}
                onChange={(wrap) => changeBinding(index, (next) => {
                  if (wrap) delete next.wrap
                  else next.wrap = false
                })}
              />
            ) : null}
            {REPEAT_ACTIONS.has(action) ? (
              <Toggle
                label={t('controls.bindingList.repeatWhileHeld')}
                checked={binding.repeat ?? false}
                onChange={(repeat) => changeBinding(index, (next) => {
                  if (repeat) next.repeat = true
                  else delete next.repeat
                })}
              />
            ) : null}
            <span className="flex-1" />
            <RemoveButton
              label={t('controls.bindingList.removeActionNumber', { number: index + 1 })}
              onClick={() => removeBinding(index)}
            />
          </div>
        )
      })}
      {bindings.length < MAXIMUM_CONTROL_BINDINGS ? (
        <AddButton
          label={t('controls.bindingList.addAction')}
          onClick={() => addBinding(firstUnbound(buttons.length, bindings), actions[0] ?? 'leds_toggle')}
        />
      ) : null}
    </div>
  )
}
