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
  ColorSwatchInput,
  NumberInput,
  OptionalColorField,
  SelectInput
} from '@/features/configuration/inspector/fields'
import {
  AddButton,
  RemoveButton
} from '@/features/configuration/inspector/widget-editors'
import { HINTS } from './hints'
import { Subsection } from './Subsection'
import { applyWatchedBinding, releaseWatchedBinding } from './watched-source'

const DEFAULT_WATCH = 'engine.rpm_percent'
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
    <Subsection title="Colour when">
      <OptionalColorField
        label="Background"
        hint={HINTS.effect.background}
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
          label="Watches"
          value={watched}
          onChange={(binding) => update((next) => applyWatchedBinding(next, binding))}
        />
      ) : null}
      {rules.map((rule, position) => (
        <div key={position} className="space-y-1 rounded-md border p-2">
          <PropertyRow label={`Rule ${position + 1}`} hint={position === 0 ? HINTS.effect.colors : undefined}>
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
                      ? `Threshold in ${field.unit}`
                      : 'Threshold'
                  }
                  value={rule.value ?? 0}
                  step="any"
                  onChange={(value) => changeRule(position, (next) => { next.value = value })}
                />
              )}
              <ColorSwatchInput
                label={`Rule ${position + 1} colour`}
                value={rule.color ?? DEFAULT_RULE_COLOR}
                onChange={(color) => changeRule(position, (next) => { next.color = color })}
              />
              <RemoveButton
                label={`Remove colour rule ${position + 1}`}
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
            label="Background"
            value={rule.background_color}
            onChange={(color) =>
              changeRule(position, (next) => {
                if (color) next.background_color = color
                else delete next.background_color
              })
            }
          />
          <PropertyRow label="Timing" hint={HINTS.effect.ruleTiming}>
            <div className="grid grid-cols-2 gap-1">
              <NumberInput
                title="Blink period in milliseconds while this rule holds, 0 is steady"
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
                title="Hold in milliseconds after this rule stops matching"
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
              <span>Blink (ms)</span>
              <span>Hold (ms)</span>
            </div>
          </PropertyRow>
        </div>
      ))}
      {rules.length < MAXIMUM_LED_COLOR_RULES ? (
        <AddButton
          label="Add colour rule"
          onClick={() =>
            update((next) => {
              if (!next.condition_source?.binding) applyWatchedBinding(next, DEFAULT_WATCH)
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
