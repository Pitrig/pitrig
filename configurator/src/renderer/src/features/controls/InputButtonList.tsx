import {
  MAXIMUM_INPUT_BUTTONS,
  MAXIMUM_INPUT_SOURCES,
  type InputButton
} from '@shared/configuration-schema'
import { arrayOf } from '@shared/configuration-access'
import { t } from '@shared/ui-text'
import { cn } from '@/lib/utils'
import { useDeviceStore } from '@/features/device/device-store'
import { TextInput } from '@/features/configuration/inspector/fields'
import { AddButton, RemoveButton } from '@/features/configuration/inspector/widget-editors'
import {
  addButton,
  clearButton,
  inputButtonsOf,
  removeInput,
  renameButton
} from './controls-document'
import { CaptureButton, InputChip, Lamp } from './input-parts'
import { armCapture, buttonLit, inputLit, useInputTester } from './input-tester'

function ButtonRow({
  index,
  button,
  listening
}: {
  index: number
  button: InputButton
  listening: boolean
}): React.JSX.Element {
  const tester = useInputTester()
  const sources = arrayOf(button.sources)
  const lit = buttonLit(tester, index, button)
  const full = sources.length >= MAXIMUM_INPUT_SOURCES
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors',
        lit ? 'border-emerald-400/50 bg-emerald-400/5' : undefined
      )}
    >
      <Lamp lit={lit} />
      <span className="w-5 flex-none text-right tabular-nums text-muted-foreground">{index + 1}</span>
      <div className="w-40 flex-none">
        <TextInput
          value={button.name ?? ''}
          placeholder={t('controls.document.buttonNumber', { number: index + 1 })}
          onChange={(name) => renameButton(index, name)}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
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
              ? t('controls.inputButtonList.startSimhubToAssign')
              : full
                ? t('controls.inputButtonList.fourInputsAtMost', { count: MAXIMUM_INPUT_SOURCES })
                : t('controls.inputButtonList.pressAssignThenTheButton')
          }
        />
      </div>
      <RemoveButton
        label={t('controls.inputButtonList.clearButtonNumber', { number: index + 1 })}
        onClick={() => clearButton(index)}
      />
    </div>
  )
}

export function InputButtonList({ listening }: { listening: boolean }): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const buttons = inputButtonsOf(draft)
  const full = buttons.length >= MAXIMUM_INPUT_BUTTONS && buttons.every((button) => button.name || button.sources?.length)
  return (
    <div className="space-y-1.5">
      {buttons.length === 0 ? (
        <p className="text-muted-foreground">{t('controls.inputButtonList.noButtonsYet')}</p>
      ) : null}
      {buttons.map((button, index) => (
        <ButtonRow key={index} index={index} button={button} listening={listening} />
      ))}
      {full ? (
        <p className="text-muted-foreground">
          {t('controls.inputButtonList.allButtonsUsed', { count: MAXIMUM_INPUT_BUTTONS })}
        </p>
      ) : (
        <AddButton
          label={t('controls.inputButtonList.addButton')}
          onClick={() => {
            const index = addButton(draft)
            if (index !== undefined && listening) armCapture({ kind: 'button', index })
          }}
        />
      )}
    </div>
  )
}
