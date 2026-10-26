import { MAXIMUM_SWITCH_POSITIONS } from '@shared/configuration-schema'
import { t } from '@shared/ui-text'
import { cn } from '@/lib/utils'
import { Select } from '@/components/ui/select'
import { useDeviceStore } from '@/features/device/device-store'
import { CONTROL } from '@/features/configuration/inspector/fields'
import { PropertyRow } from '@/features/configuration/inspector/PropertyRow'
import { RemoveButton } from '@/features/configuration/inspector/widget-editors'
import {
  boardHasDisplay,
  controlsOf,
  removeInput,
  removePosition,
  setSwitchSlot,
  slotChoicesOf,
  switchPositionsOf
} from './controls-document'
import { CaptureButton, InputChip, Lamp } from './input-parts'
import { inputLit, selectedPosition, useInputTester } from './input-tester'

export function SwitchSection({ listening }: { listening: boolean }): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const tester = useInputTester()
  const positions = switchPositionsOf(draft)
  const selected = selectedPosition(tester, positions)
  const slot = controlsOf(draft).switch?.slot ?? ''
  const slots = slotChoicesOf(draft)
  const pages = slots.find((choice) => choice.id === slot)?.pages
  const unassigned = listening ? undefined : t('controls.inputButtonList.startSimhubToAssign')
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {positions.map((position, index) => (
          <div
            key={index}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2 py-1',
              index === selected ? 'border-emerald-400/50 bg-emerald-400/5' : undefined
            )}
          >
            <Lamp lit={index === selected} />
            <span className="tabular-nums text-muted-foreground">{index + 1}</span>
            {position.id ? (
              <InputChip
                id={position.id}
                lit={inputLit(tester, position.id)}
                onRemove={() => removeInput(position.id ?? '')}
              />
            ) : (
              <CaptureButton target={{ kind: 'position', index }} disabled={!listening} title={unassigned} />
            )}
            {index === positions.length - 1 ? (
              <RemoveButton
                label={t('controls.switchSection.removePositionNumber', { number: index + 1 })}
                onClick={() => removePosition(index)}
              />
            ) : null}
          </div>
        ))}
        {positions.length < MAXIMUM_SWITCH_POSITIONS ? (
          <CaptureButton
            target={{ kind: 'position', index: positions.length }}
            disabled={!listening}
            title={unassigned ?? t('controls.switchSection.turnTheSwitchToThe')}
            label={t('controls.switchSection.addPosition')}
          />
        ) : null}
      </div>
      {positions.length === 0 ? (
        <p className="text-muted-foreground">{t('controls.switchSection.noPositionsYet')}</p>
      ) : null}
      {boardHasDisplay(draft) ? (
        <div className="max-w-md">
          <PropertyRow label={t('controls.switchSection.turnsThePagesOf')} hint={t('controls.hints.switchSlot')}>
            <Select
              className={CONTROL}
              value={slot}
              options={[
                { value: '', label: t('controls.switchSection.noSlot') },
                ...slots.map((choice) => ({ value: choice.id, label: choice.id }))
              ]}
              onChange={setSwitchSlot}
            />
          </PropertyRow>
        </div>
      ) : null}
      {pages !== undefined && positions.length > pages ? (
        <p className="text-amber-400/80">
          {t('controls.switchSection.morePositionsThanPages', { positions: positions.length, pages })}
        </p>
      ) : null}
    </div>
  )
}
