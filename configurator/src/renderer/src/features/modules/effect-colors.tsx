import {
  CONDITION_OPERATOR_VALUES,
  MAXIMUM_LED_COLOR_RULES,
  type LedColorRule,
  type LedEffect
} from '@shared/configuration-schema'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import {
  BOOLEAN_OPERATORS,
  MAXIMUM_BLINK_MS,
  MAXIMUM_HOLD_MS,
  MINIMUM_BLINK_MS
} from '@shared/widget-conditions'
import { PropertyRow } from '@/features/configuration/inspector/PropertyRow'
import { TelemetryBindingField } from '@/features/configuration/inspector/TelemetryBindingField'
import {
  NumberInput,
  OptionalColorField,
  SelectInput
} from '@/features/configuration/inspector/fields'
import {
  AddButton,
  RemoveButton
} from '@/features/configuration/inspector/widget-editors'
import { t } from '@shared/ui-text'
import { Subsection } from './Subsection'
import {
  applyWatchedBinding,
  DEFAULT_WATCHED_BINDING,
  releaseWatchedBinding
} from './watched-source'

const DEFAULT_THRESHOLD = 90
const DEFAULT_RULE_COLOR = '#D50000'

export function EffectColors({
  effect,
  update
}: {
  effect: LedEffect
  update: (mutation: (next: LedEffect) => void) => void
}): React.JSX.Element {
  const rules = effect.color_rules ?? []
  const watched = effect.condition_source?.binding ?? ''
  const field = TELEMETRY_CATALOG.find(({ name }) => name === watched)
  const boolean = field?.type === 'boolean'
  const operators = boolean ? BOOLEAN_OPERATORS : CONDITION_OPERATOR_VALUES

  const changeRule = (position: number, mutation: (rule: LedColorRule) => void): void =>
    update((next) => {
      const list = [...(next.color_rules ?? [])]
      const rule = { ...list[position] }
      mutation(rule)
      list[position] = rule
      next.color_rules = list
    })

  return (
    <Subsection title={t('modules.effectColors.colourWhen')}>
      <OptionalColorField
        label={t('modules.effectColors.background')}
        hint={t('modules.hints.effect.background')}
        value={effect.background_color}
        onChange={(color) =>
          update((next) => {
            if (color) next.background_color = color
            else delete next.background_color
          })
        }
      />
      {rules.length > 0 && effect.gate !== 'conditions' ? (
        <TelemetryBindingField
          label={t('modules.effectColors.watches')}
          value={watched}
          onChange={(binding) => update((next) => applyWatchedBinding(next, binding))}
        />
      ) : null}
      {rules.map((rule, position) => (
        <div key={position} className="space-y-1 rounded-md border p-2">
          <PropertyRow label={t('inspector.conditionsEditor.ruleNumber', { number: position + 1 })} hint={position === 0 ? t('modules.hints.effect.colors') : undefined}>
            <div className="flex items-center gap-1">
              <SelectInput
                value={rule.op ?? 'at_or_above'}
                options={operators}
                onChange={(op) => changeRule(position, (next) => { next.op = op })}
              />
              {boolean ? (
                <SelectInput
                  value={(rule.value ?? 0) >= 1 ? 'true' : 'false'}
                  options={['true', 'false']}
                  onChange={(value) =>
                    changeRule(position, (next) => { next.value = value === 'true' ? 1 : 0 })
                  }
                />
              ) : (
                <NumberInput
                  title={
                    field?.unit && field.unit !== 'source'
                      ? t('inspector.conditionsEditor.thresholdInUnit', { unit: field.unit })
                      : t('inspector.slotPagesEditor.threshold')
                  }
                  value={rule.value ?? 0}
                  step="any"
                  onChange={(value) => changeRule(position, (next) => { next.value = value })}
                />
              )}
              <RemoveButton
                label={t('modules.effectColors.removeColourRuleNumber', { number: position + 1 })}
                onClick={() =>
                  update((next) => {
                    const list = (next.color_rules ?? []).filter((_, at) => at !== position)
                    if (list.length > 0) next.color_rules = list
                    else delete next.color_rules
                    releaseWatchedBinding(next)
                  })
                }
              />
            </div>
          </PropertyRow>
          <OptionalColorField
            label={t('modules.effectEditor.colour')}
            value={rule.color}
            onChange={(color) =>
              changeRule(position, (next) => {
                if (color) next.color = color
                else delete next.color
              })
            }
          />
          <OptionalColorField
            label={t('modules.effectColors.background')}
            value={rule.background_color}
            onChange={(color) =>
              changeRule(position, (next) => {
                if (color) next.background_color = color
                else delete next.background_color
              })
            }
          />
          <PropertyRow label={t('modules.effectColors.timing')} hint={t('modules.hints.effect.ruleTiming')}>
            <div className="grid grid-cols-2 gap-1">
              <NumberInput
                title={t('modules.effectColors.blinkPeriodInMillisecondsWhile')}
                value={rule.blink_ms ?? 0}
                min={0}
                max={MAXIMUM_BLINK_MS}
                onChange={(value) =>
                  changeRule(position, (next) => {
                    const period = Math.round(value)
                    if (period <= 0) delete next.blink_ms
                    else next.blink_ms = Math.min(MAXIMUM_BLINK_MS, Math.max(MINIMUM_BLINK_MS, period))
                  })
                }
              />
              <NumberInput
                title={t('modules.effectColors.holdInMillisecondsAfterThis')}
                value={rule.hold_ms ?? 0}
                min={0}
                max={MAXIMUM_HOLD_MS}
                onChange={(value) =>
                  changeRule(position, (next) => {
                    const hold = Math.round(value)
                    if (hold <= 0) delete next.hold_ms
                    else next.hold_ms = Math.min(MAXIMUM_HOLD_MS, hold)
                  })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground">
              <span>{t('modules.effectColors.blinkMs')}</span>
              <span>{t('modules.effectColors.holdMs')}</span>
            </div>
          </PropertyRow>
        </div>
      ))}
      {rules.length < MAXIMUM_LED_COLOR_RULES ? (
        <AddButton
          label={t('modules.effectColors.addColourRule')}
          onClick={() =>
            update((next) => {
              if (!next.condition_source?.binding) {
                applyWatchedBinding(next, DEFAULT_WATCHED_BINDING)
              }
              next.color_rules = [
                ...(next.color_rules ?? []),
                { op: 'at_or_above', value: DEFAULT_THRESHOLD, color: DEFAULT_RULE_COLOR }
              ]
            })
          }
        />
      ) : null}
    </Subsection>
  )
}
