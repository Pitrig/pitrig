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
import { Group } from '@/features/configuration/inspector/Group'
import { GROUP_ICONS } from '@/features/configuration/inspector/icons'
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
import { HINTS } from './hints'

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
      <Group id="LedGate" title="When it paints" icon={GROUP_ICONS.conditions} summary={effect.gate ?? 'always'} defaultOpen={gated}>
        <SelectField
          label="Gate"
          hint={HINTS.effect.gate}
          value={effect.gate ?? 'always'}
          options={LED_GATE_VALUES}
          modified={authored(effect.gate, 'always')}
          onChange={(gate) => update((next) => {
            next.gate = gate
            if (gate !== 'conditions') {
              delete next.condition_source
              delete next.conditions
            }
          })}
        />
        {gated ? (
          <>
            <TelemetryBindingField
              label="Watches"
              value={watched}
              onChange={(binding) => update((next) => {
                if (binding) next.condition_source = { ...next.condition_source, binding }
                else delete next.condition_source
                const selected = TELEMETRY_CATALOG.find(({ name }) => name === binding)
                if (selected?.type !== 'boolean') return
                next.conditions = (next.conditions ?? []).map((rule) => ({
                  ...rule,
                  op: BOOLEAN_OPERATORS.includes(rule.op ?? 'at_or_above')
                    ? rule.op
                    : 'equal',
                  value: (rule.value ?? 0) >= 1 ? 1 : 0
                }))
              })}
            />
            {(effect.conditions ?? []).map((rule, position) => (
              <PropertyRow key={position} label={`Rule ${position + 1}`}>
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
                      title={field?.unit && field.unit !== 'source' ? `Threshold in ${field.unit}` : 'Threshold'}
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
                    label={`Remove rule ${position + 1}`}
                    onClick={() => update((next) => {
                      next.conditions = (next.conditions ?? []).filter((_, at) => at !== position)
                    })}
                  />
                </div>
              </PropertyRow>
            ))}
            {(effect.conditions ?? []).length < MAXIMUM_WIDGET_CONDITIONS ? (
              <AddButton
                label="Add rule"
                onClick={() => update((next) => {
                  next.conditions = [...(next.conditions ?? []), { op: 'at_or_above', value: 1 }]
                })}
              />
            ) : null}
          </>
        ) : null}
        <NumberField
          label="Hold"
          suffix="ms"
          hint={HINTS.effect.hold}
          value={effect.hold_ms ?? 0}
          {...fieldBounds('LedEffect', 'hold_ms')}
          modified={authored(effect.hold_ms, 0)}
          onChange={(hold_ms) => update((next) => { next.hold_ms = hold_ms })}
        />
        <NumberField
          label="Blink"
          suffix="ms"
          hint={HINTS.effect.blink}
          value={effect.blink_ms ?? 0}
          {...fieldBounds('LedEffect', 'blink_ms')}
          modified={authored(effect.blink_ms, 0)}
          onChange={(blink_ms) => update((next) => { next.blink_ms = blink_ms })}
        />
      </Group>
  )
}
