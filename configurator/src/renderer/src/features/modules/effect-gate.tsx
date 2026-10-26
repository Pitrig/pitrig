import {
  LED_GATE_VALUES,
  MAXIMUM_WIDGET_CONDITIONS,
  type LedEffect
} from '@shared/configuration-schema'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { operatorsFor } from '@shared/widget-conditions'
import { fieldBounds } from '@shared/validate/ranges'
import { authored } from '@/features/configuration/inspector/authored'
import { PropertyRow } from '@/features/configuration/inspector/PropertyRow'
import { TelemetryBindingField } from '@/features/configuration/inspector/TelemetryBindingField'
import {
  NumberField,
  NumberInput,
  OptionalColorField,
  SelectField,
  SelectInput
} from '@/features/configuration/inspector/fields'
import {
  AddButton,
  RemoveButton
} from '@/features/configuration/inspector/widget-editors'
import { t } from '@shared/ui-text'
import { Subsection } from './Subsection'
import { wholeValue } from './field-values'
import {
  applyWatchedBinding,
  DEFAULT_WATCHED_BINDING,
  releaseWatchedBinding
} from './watched-source'

export function EffectGate({
  effect,
  update,
  showsThrough
}: {
  effect: LedEffect
  update: (mutation: (next: LedEffect) => void) => void
  showsThrough?: string
}): React.JSX.Element {
  const gated = effect.gate === 'conditions'
  const watched = effect.condition_source?.binding ?? ''
  const field = TELEMETRY_CATALOG.find(({ name }) => name === watched)
  const boolean = field?.type === 'boolean'
  const operators = operatorsFor(watched)
  return (
      <Subsection title={t('modules.effectGate.whenItPaints')}>
        <SelectField
          label={t('modules.effectGate.gate')}
          hint={t('modules.hints.effect.gate')}
          value={effect.gate ?? 'always'}
          options={LED_GATE_VALUES}
          modified={authored(effect.gate, 'always')}
          onChange={(gate) => update((next) => {
            next.gate = gate
            if (gate !== 'conditions') {
              delete next.conditions
              releaseWatchedBinding(next)
              return
            }
            if (!next.condition_source?.binding) {
              applyWatchedBinding(next, DEFAULT_WATCHED_BINDING)
            }
            if ((next.conditions ?? []).length === 0) {
              next.conditions = [{ op: 'at_or_above', value: 1 }]
            }
          })}
        />
        {gated ? (
          <>
            <TelemetryBindingField
              label={t('modules.effectColors.watches')}
              value={watched}
              onChange={(binding) => update((next) => applyWatchedBinding(next, binding))}
            />
            {(effect.conditions ?? []).map((rule, position) => (
              <PropertyRow key={position} label={t('inspector.conditionsEditor.ruleNumber', { number: position + 1 })}>
                <div className="flex items-center gap-1">
                  <SelectInput
                    value={rule.op ?? 'at_or_above'}
                    options={operators}
                    onChange={(op) => update((next) => {
                      const list = [...(next.conditions ?? [])]
                      list[position] = { ...list[position], op }
                      next.conditions = list
                    })}
                  />
                  {boolean ? (
                    <SelectInput
                      value={(rule.value ?? 0) >= 1 ? 'true' : 'false'}
                      options={['true', 'false']}
                      onChange={(value) => update((next) => {
                        const list = [...(next.conditions ?? [])]
                        list[position] = { ...list[position], value: value === 'true' ? 1 : 0 }
                        next.conditions = list
                      })}
                    />
                  ) : (
                    <NumberInput
                      title={field?.unit && field.unit !== 'source' ? t('inspector.conditionsEditor.thresholdInUnit', { unit: field.unit }) : t('inspector.slotPagesEditor.threshold')}
                      value={rule.value ?? 0}
                      step="any"
                      onChange={(value) => update((next) => {
                        const list = [...(next.conditions ?? [])]
                        list[position] = { ...list[position], value }
                        next.conditions = list
                      })}
                    />
                  )}
                  <RemoveButton
                    label={t('inspector.conditionsEditor.removeRuleNumber', { number: position + 1 })}
                    onClick={() => update((next) => {
                      next.conditions = (next.conditions ?? []).filter((_, at) => at !== position)
                    })}
                  />
                </div>
              </PropertyRow>
            ))}
            {(effect.conditions ?? []).length < MAXIMUM_WIDGET_CONDITIONS ? (
              <AddButton
                label={t('modules.effectGate.addRule')}
                onClick={() => update((next) => {
                  next.conditions = [...(next.conditions ?? []), { op: 'at_or_above', value: 1 }]
                })}
              />
            ) : null}
            {!boolean ? (
              <NumberField
                label={t('modules.effectGate.switchOffMargin')}
                hint={t('modules.hints.effect.hysteresis')}
                value={effect.hysteresis ?? 0}
                min={0}
                step="any"
                suffix={field?.unit && field.unit !== 'source' ? field.unit : undefined}
                modified={authored(effect.hysteresis, 0)}
                onChange={(value) =>
                  update((next) => {
                    if (value > 0) next.hysteresis = value
                    else delete next.hysteresis
                  })
                }
              />
            ) : null}
          </>
        ) : null}
        <NumberField
          label={t('modules.effectGate.hold')}
          suffix="ms"
          hint={t('modules.hints.effect.hold')}
          value={effect.hold_ms ?? 0}
          {...fieldBounds('LedEffect', 'hold_ms')}
          modified={authored(effect.hold_ms, 0)}
          onChange={(hold_ms) =>
            update((next) => { next.hold_ms = wholeValue('LedEffect', 'hold_ms', hold_ms) })
          }
        />
        <NumberField
          label={t('modules.effectGate.blink')}
          suffix="ms"
          hint={t('modules.hints.effect.blink')}
          value={effect.blink_ms ?? 0}
          {...fieldBounds('LedEffect', 'blink_ms')}
          modified={authored(effect.blink_ms, 0)}
          onChange={(blink_ms) =>
            update((next) => { next.blink_ms = wholeValue('LedEffect', 'blink_ms', blink_ms) })
          }
        />
        <OptionalColorField
          label={t('modules.effectGate.coversLayersBelow')}
          unsetLabel={t('modules.effectGate.noTheyShowThrough')}
          hint={t('modules.hints.effect.background')}
          value={effect.background_color}
          onChange={(color) =>
            update((next) => {
              if (color) next.background_color = color
              else delete next.background_color
            })
          }
        />
        {showsThrough ? (
          <div className="flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
            <span className="min-w-0 flex-1">
              {t('modules.effectGate.betweenFlashesNamesShowThrough', { names: showsThrough })}
            </span>
            <button
              type="button"
              className="flex-none rounded border border-amber-500/40 px-1.5 py-0.5 hover:bg-amber-500/20"
              onClick={() => update((next) => { next.background_color = '#000000' })}
            >
              {t('modules.effectGate.coverThem')}
            </button>
          </div>
        ) : null}
      </Subsection>
  )
}
