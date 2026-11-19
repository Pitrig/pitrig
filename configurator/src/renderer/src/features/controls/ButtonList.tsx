import {
  MAXIMUM_CONTROL_BINDINGS,
  MAXIMUM_INPUT_BUTTONS,
  MAXIMUM_INPUT_SOURCES,
  type ControlAction,
  type ControlBinding,
  type InputButton
} from '@shared/configuration-schema'
import { arrayOf } from '@shared/configuration-access'
import { SCREEN_ACTIONS, SLOT_ACTIONS, actionsFor } from '@shared/control-actions'
import { t } from '@shared/ui-text'
import { cn } from '@/lib/utils'
import { Select, type SelectOption } from '@/components/ui/select'
import { useDeviceStore } from '@/features/device/device-store'
import { CONTROL, TextInput } from '@/features/configuration/inspector/fields'
import { AddButton, RemoveButton } from '@/features/configuration/inspector/widget-editors'
import {
  addBinding,
  controlsOf,
  removeBindingsOf,
  screenIdsOf,
  slotChoicesOf,
  type SlotChoice
} from '@/features/configuration/dashboard-editor'
import { ActionLine } from './ActionLine'
import { CaptureButton, InputChip, Lamp } from './input-parts'
import { armCapture, buttonLit, inputLit, useInputTester } from './input-tester'
import {
  addButton,
  boardHasDisplay,
  buttonIndicesOf,
  clearButton,
  inputButtonsOf,
  removeInput,
  renameButton
} from './inputs-document'

interface RowContext {
  listening: boolean
  bindings: readonly ControlBinding[]
  actions: readonly SelectOption<ControlAction>[]
  screens: readonly string[]
  slots: readonly SlotChoice[]
}

function removeRow(index: number): void {
  const { beginEdit, endEdit } = useDeviceStore.getState()
  beginEdit()
  try {
    clearButton(index)
    removeBindingsOf(index + 1)
  } finally {
    endEdit()
  }
}

function ButtonRow({
  index,
  button,
  context
}: {
  index: number
  button: InputButton | undefined
  context: RowContext
}): React.JSX.Element {
  const tester = useInputTester()
  const { listening, bindings, actions, screens, slots } = context
  const sources = arrayOf(button?.sources)
  const lit = buttonLit(tester, index, button)
  const full = sources.length >= MAXIMUM_INPUT_SOURCES
  const placeholder = t('controls.document.buttonNumber', { number: index + 1 })
  const own = bindings.flatMap((binding, at) => ((binding.button ?? 1) === index + 1 ? [{ binding, at }] : []))
  const unused = actions.find(
    (option) => !option.disabled && !own.some(({ binding }) => binding.action === option.value)
  )
  return (
    <div
      className={cn(
        'grid gap-x-4 gap-y-2 rounded-md border px-2 py-2 transition-colors md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]',
        lit ? 'border-emerald-400/50 bg-emerald-400/5' : undefined
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <Lamp lit={lit} />
          <span className="w-5 flex-none text-right tabular-nums text-muted-foreground">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <TextInput
              value={button?.name ?? ''}
              placeholder={placeholder}
              onChange={(name) => renameButton(index, name)}
            />
          </div>
          <RemoveButton
            label={t('controls.buttonList.removeName', { name: button?.name || placeholder })}
            onClick={() => removeRow(index)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 pl-[2.375rem]">
          {sources.length === 0 ? (
            <span className="text-[11px] text-amber-400">{t('controls.buttonList.notAssignedYet')}</span>
          ) : null}
          {sources.map((source) =>
            source.id ? (
              <InputChip
                key={source.id}
                id={source.id}
                lit={inputLit(tester, source.id)}
                onRemove={() => removeInput(source.id ?? '')}
              />
            ) : null
          )}
          <CaptureButton
            target={{ kind: 'button', index }}
            disabled={!listening || full}
            title={
              !listening
                ? t('controls.buttonList.startSimhubToAssign')
                : full
                  ? t('controls.buttonList.fourInputsAtMost', { count: MAXIMUM_INPUT_SOURCES })
                  : t('controls.buttonList.pressAssignThenTheButton')
            }
          />
        </div>
      </div>
      <div className="min-w-0 space-y-1.5">
        {own.map(({ binding, at }) => (
          <ActionLine key={at} binding={binding} index={at} actions={actions} screens={screens} slots={slots} />
        ))}
        {own.length === 0 ? (
          <Select<ControlAction | ''>
            className={cn(CONTROL, 'w-44')}
            aria-label={t('controls.actionLine.action')}
            value=""
            placeholder={t('controls.buttonList.chooseWhatItDoes')}
            options={actions}
            onChange={(action) => {
              if (action) addBinding(index + 1, action)
            }}
          />
        ) : unused && bindings.length < MAXIMUM_CONTROL_BINDINGS ? (
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => addBinding(index + 1, unused.value)}
          >
            {t('controls.buttonList.alsoDoSomethingElse')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function ButtonList({ listening }: { listening: boolean }): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const buttons = inputButtonsOf(draft)
  const indices = buttonIndicesOf(draft)
  const screens = screenIdsOf(draft)
  const slots = slotChoicesOf(draft)
  const blocked = (action: ControlAction): boolean =>
    (SCREEN_ACTIONS.has(action) && screens.length === 0) || (SLOT_ACTIONS.has(action) && slots.length === 0)
  const context: RowContext = {
    listening,
    bindings: arrayOf(controlsOf(draft).bindings),
    actions: actionsFor(boardHasDisplay(draft)).map((action) => ({
      value: action,
      label: t(`controls.actions.${action}`),
      disabled: blocked(action)
    })),
    screens,
    slots
  }
  return (
    <div className="space-y-1.5">
      {indices.length === 0 ? (
        <p className="text-muted-foreground">{t('controls.buttonList.noButtonsYet')}</p>
      ) : null}
      {indices.map((index) => (
        <ButtonRow key={index} index={index} button={buttons[index]} context={context} />
      ))}
      {indices.length >= MAXIMUM_INPUT_BUTTONS ? (
        <p className="text-muted-foreground">
          {t('controls.buttonList.allButtonsUsed', { count: MAXIMUM_INPUT_BUTTONS })}
        </p>
      ) : (
        <AddButton
          label={t('controls.buttonList.addButton')}
          onClick={() => {
            const index = addButton(draft)
            if (index !== undefined && listening) armCapture({ kind: 'button', index })
          }}
        />
      )}
    </div>
  )
}
