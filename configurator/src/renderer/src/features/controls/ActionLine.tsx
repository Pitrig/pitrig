import type { ControlAction, ControlBinding } from '@shared/configuration-schema'
import {
  PAGE_ACTIONS,
  REPEAT_ACTIONS,
  SCREEN_ACTIONS,
  SLOT_ACTIONS,
  WRAP_ACTIONS
} from '@shared/control-actions'
import { t } from '@shared/ui-text'
import { cn } from '@/lib/utils'
import { Select, type SelectOption } from '@/components/ui/select'
import { CONTROL } from '@/features/configuration/inspector/fields'
import { RemoveButton } from '@/features/configuration/inspector/widget-editors'
import {
  applyAction,
  changeBinding,
  removeBinding,
  type SlotChoice
} from '@/features/configuration/dashboard-editor'

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
        aria-label={t('controls.actionLine.screen')}
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
        aria-label={t('controls.actionLine.slot')}
        value={binding.slot ?? ''}
        options={slots.map((choice) => ({ value: choice.id, label: choice.id }))}
        onChange={(slot) => changeBinding(index, (next) => { next.slot = slot })}
      />
      {PAGE_ACTIONS.has(action) ? (
        <Select
          className={cn(CONTROL, 'w-24')}
          aria-label={t('controls.actionLine.page')}
          value={binding.page ?? 1}
          options={Array.from({ length: Math.max(pages, 1) }, (_, page) => ({
            value: page + 1,
            label: t('controls.actionLine.pageNumber', { number: page + 1 })
          }))}
          onChange={(page) => changeBinding(index, (next) => { next.page = page })}
        />
      ) : null}
    </>
  )
}

export function ActionLine({
  binding,
  index,
  actions,
  screens,
  slots
}: {
  binding: ControlBinding
  index: number
  actions: readonly SelectOption<ControlAction>[]
  screens: readonly string[]
  slots: readonly SlotChoice[]
}): React.JSX.Element {
  const action = binding.action ?? 'next_screen'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        className={cn(CONTROL, 'w-44')}
        aria-label={t('controls.actionLine.action')}
        value={action}
        options={actions}
        onChange={(next) => changeBinding(index, (target, current) => applyAction(target, next, current))}
      />
      <Target binding={binding} index={index} screens={screens} slots={slots} />
      {WRAP_ACTIONS.has(action) ? (
        <Toggle
          label={t('controls.actionLine.wrap')}
          checked={binding.wrap ?? true}
          onChange={(wrap) => changeBinding(index, (next) => {
            if (wrap) delete next.wrap
            else next.wrap = false
          })}
        />
      ) : null}
      {REPEAT_ACTIONS.has(action) ? (
        <Toggle
          label={t('controls.actionLine.repeatWhileHeld')}
          checked={binding.repeat ?? false}
          onChange={(repeat) => changeBinding(index, (next) => {
            if (repeat) next.repeat = true
            else delete next.repeat
          })}
        />
      ) : null}
      <span className="flex-1" />
      <RemoveButton
        label={t('controls.actionLine.removeAction', { action: t(`controls.actions.${action}`) })}
        onClick={() => removeBinding(index)}
      />
    </div>
  )
}
