import {
  MAXIMUM_DISMISS_MS,
  MAXIMUM_IDLE_RETURN_MS,
  SLOT_DISMISS_VALUES,
  type SlotPageConfiguration,
  type SlotWidgetConfiguration
} from '@shared/configuration-schema'
import { t } from '@shared/ui-text'
import { authored } from './authored'
import { NumberField, SelectField } from './fields'

const SECOND_MS = 1000
const DEFAULT_DISMISS_MS = 30_000

function seconds(milliseconds: number | undefined): number {
  return (milliseconds ?? 0) / SECOND_MS
}

function milliseconds(value: number, limit: number): number {
  return Math.round(Math.min(Math.max(value, 0), limit / SECOND_MS)) * SECOND_MS
}

export function SlotHomeField({
  widget,
  update
}: {
  widget: SlotWidgetConfiguration
  update: (mutation: (next: SlotWidgetConfiguration) => void) => void
}): React.JSX.Element {
  return (
    <NumberField
      label={t('inspector.slotControls.firstPageAfter')}
      hint={t('inspector.hints.slot.homeAfter')}
      suffix={t('controls.homeSection.seconds')}
      value={seconds(widget.home_after_ms)}
      min={0}
      max={MAXIMUM_IDLE_RETURN_MS / SECOND_MS}
      step={1}
      modified={authored(widget.home_after_ms, 0)}
      onReset={() => update((next) => { delete next.home_after_ms })}
      onChange={(value) =>
        update((next) => {
          const after = milliseconds(value, MAXIMUM_IDLE_RETURN_MS)
          if (after > 0) next.home_after_ms = after
          else delete next.home_after_ms
        })
      }
    />
  )
}

export function DismissFields({
  page,
  change
}: {
  page: SlotPageConfiguration
  change: (mutation: (next: SlotPageConfiguration) => void) => void
}): React.JSX.Element {
  const dismiss = page.dismiss ?? 'next_event'
  return (
    <>
      <SelectField
        label={t('inspector.slotControls.dismissedUntil')}
        hint={t('inspector.hints.slot.dismiss')}
        value={dismiss}
        options={SLOT_DISMISS_VALUES}
        modified={authored(page.dismiss, 'next_event')}
        onReset={() =>
          change((next) => {
            delete next.dismiss
            delete next.dismiss_ms
          })
        }
        onChange={(value) =>
          change((next) => {
            if (value === 'next_event') delete next.dismiss
            else next.dismiss = value
            if (value === 'timed') next.dismiss_ms = next.dismiss_ms || DEFAULT_DISMISS_MS
            else delete next.dismiss_ms
          })
        }
      />
      {dismiss === 'timed' ? (
        <NumberField
          label={t('inspector.slotControls.dismissedFor')}
          suffix={t('controls.homeSection.seconds')}
          value={seconds(page.dismiss_ms)}
          min={1}
          max={MAXIMUM_DISMISS_MS / SECOND_MS}
          step={1}
          onChange={(value) =>
            change((next) => {
              next.dismiss_ms = Math.max(SECOND_MS, milliseconds(value, MAXIMUM_DISMISS_MS))
            })
          }
        />
      ) : null}
    </>
  )
}
