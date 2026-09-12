import {
  CONDITION_OPERATOR_VALUES,
  LED_GATE_VALUES,
  MAXIMUM_WIDGET_CONDITIONS,
  type LedEffect
} from '@shared/configuration-schema'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { BOOLEAN_OPERATORS } from '@shared/widget-conditions'
import { fieldBounds } from '@shared/validate/ranges'
import { authored } from '@/features/configuration/inspector/authored'
import { PropertyRow } from '@/features/configuration/inspector/PropertyRow'
import { TelemetryBindingField } from '@/features/configuration/inspector/TelemetryBindingField'
import {
  NumberField,
  NumberInput,
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
  update
}: {
  effect: LedEffect
  update: (mutation: (next: LedEffect) => void) => void
}): React.JSX.Element {
  const gated = effect.gate === 'conditions'
  const watched = effect.condition_source?.binding ?? ''
  const field = TELEMETRY_CATALOG.find(({ name }) => name === watched)
  const boolean = field?.type === 'boolean'
  const operators = boolean ? BOOLEAN_OPERATORS : CONDITION_OPERATOR_VALUES
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
      </Subsection>
  )
}
