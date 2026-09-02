import { Plus, Trash2 } from 'lucide-react'
import type { FramedWidgetConfiguration } from '@shared/configuration-access'
import { COLOR_RAMP_TARGET_VALUES, CONDITION_OPERATOR_VALUES, type ColorStop, MAXIMUM_COLOR_STOPS, MAXIMUM_WIDGET_CONDITIONS, type WidgetCondition } from '@shared/configuration-schema'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { BOOLEAN_OPERATORS, MAXIMUM_BLINK_MS, MAXIMUM_HOLD_MS, MINIMUM_BLINK_MS } from '@shared/widget-conditions'
import { TelemetryBindingField } from './TelemetryBindingField'
import { authored } from './authored'
import { Group } from './Group'
import { InfoHint } from './InfoHint'
import { t } from '@shared/ui-text'
import { GROUP_ICONS } from './icons'
import { PropertyRow } from './PropertyRow'
import { CheckboxField, ColorSwatchInput, Hint, NumberInput, OptionalColorField, SelectField, SelectInput } from './fields'

export function ConditionsEditor({ widget, update }: {
  widget: FramedWidgetConfiguration
  update: (mutation: (next: FramedWidgetConfiguration) => void) => void
}): React.JSX.Element {
  const watched = widget.condition_source?.binding ?? ''
  const field = TELEMETRY_CATALOG.find(({ name }) => name === watched)
  const boolean = field?.type === 'boolean'
  const operators = boolean ? BOOLEAN_OPERATORS : CONDITION_OPERATOR_VALUES
  const rules = widget.conditions ?? []
  const changeRule = (index: number, mutation: (rule: WidgetCondition) => void): void => update((next) => {
    const list = next.conditions ?? []
    if (list[index]) mutation(list[index])
  })
  return (
    <Group
      id="Conditions"
      title={t('inspector.conditionsEditor.conditions')}
      icon={GROUP_ICONS.conditions}
      hint={t('inspector.hints.conditions.source')}
      summary={watched ? t('inspector.conditionsEditor.lengthRuleS', { length: rules.length }) : t('common.none')}
      defaultOpen={Boolean(watched)}
    >
      <TelemetryBindingField label={t('inspector.conditionsEditor.watch')} value={watched} onReset={() => update((next) => {
        delete next.condition_source
        delete next.conditions
      })} onChange={(value) => update((next) => {
        if (!value) {
          delete next.condition_source
          delete next.conditions
          return
        }
        next.condition_source = { ...next.condition_source, binding: value }
        const selected = TELEMETRY_CATALOG.find(({ name }) => name === value)
        if (selected?.type !== 'boolean') return
        for (const rule of next.conditions ?? []) {
          if (!BOOLEAN_OPERATORS.includes(rule.op ?? 'at_or_above')) rule.op = 'equal'
          rule.value = (rule.value ?? 0) >= 1 ? 1 : 0
        }
      })} />
      {watched ? (
        <SelectField
          label={t('inspector.conditionsEditor.modifier')}
          hint={t('inspector.hints.data.modifier')}
          value={
            widget.condition_source?.modifiers?.some(({ type }) => type === 'lap_timer')
              ? 'lap_timer'
              : 'none'
          }
          options={['none', 'lap_timer']}
          modified={widget.condition_source?.modifiers !== undefined}
          onReset={() => update((next) => {
            if (next.condition_source) delete next.condition_source.modifiers
          })}
          onChange={(value) =>
            update((next) => {
              if (value === 'lap_timer') {
                next.condition_source = {
                  binding: 'session.lap.current_time',
                  modifiers: [{ type: 'lap_timer' }]
                }
              } else if (next.condition_source) {
                delete next.condition_source.modifiers
              }
            })
          }
        />
      ) : null}
      {watched ? (
        <>
          <ColorRampEditor widget={widget} update={update} unit={field?.unit && field.unit !== 'source' ? field.unit : undefined} />
          {rules.map((rule, index) => (
            <div key={index} className="space-y-2 rounded-md border p-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{t('inspector.conditionsEditor.ruleNumber', { number: index + 1 })}</span>
                <button type="button" aria-label={`Remove rule ${index + 1}`} title={t('inspector.conditionsEditor.removeThisRule')} className="rounded-md border p-1 text-muted-foreground hover:text-foreground" onClick={() => update((next) => {
                  next.conditions = (next.conditions ?? []).filter((_, position) => position !== index)
                  if (next.conditions.length === 0) delete next.conditions
                })}>
                  <Trash2 aria-hidden className="size-3" />
                </button>
              </div>
              <PropertyRow
                label={t('inspector.conditionsEditor.when')}
                hint={t('inspector.hints.conditions.rule')}
                modified={authored(rule.op, 'at_or_above') || authored(rule.value, 0)}
                onReset={() => changeRule(index, (next) => {
                  delete next.op
                  delete next.value
                })}
              >
                <div className="grid grid-cols-2 gap-1">
                  <SelectInput value={rule.op ?? 'at_or_above'} options={operators} onChange={(value) => changeRule(index, (next) => { next.op = value })} />
                  {boolean ? (
                    <SelectInput value={(rule.value ?? 0) >= 1 ? 'true' : 'false'} options={['true', 'false']} onChange={(value) => changeRule(index, (next) => { next.value = value === 'true' ? 1 : 0 })} />
                  ) : (
                    <NumberInput title={field?.unit && field.unit !== 'source' ? t('inspector.conditionsEditor.thresholdInUnit', { unit: field.unit }) : t('inspector.slotPagesEditor.threshold')} value={rule.value ?? 0} step="any" onChange={(value) => changeRule(index, (next) => { next.value = value })} />
                  )}
                </div>
              </PropertyRow>
              <OptionalColorField label={t('inspector.conditionsEditor.value')} value={rule.color} onChange={(value) => changeRule(index, (next) => { if (value) next.color = value; else delete next.color })} />
              <OptionalColorField label={t('modules.effectColors.background')} value={rule.background_color} onChange={(value) => changeRule(index, (next) => { if (value) next.background_color = value; else delete next.background_color })} />
              <OptionalColorField label={t('inspector.conditionsEditor.border')} value={rule.border_color} onChange={(value) => changeRule(index, (next) => { if (value) next.border_color = value; else delete next.border_color })} />
              <CheckboxField label={t('inspector.conditionsEditor.hide')} checked={rule.hidden ?? false} modified={authored(rule.hidden, false)} onReset={() => changeRule(index, (next) => { delete next.hidden })} onChange={(checked) => changeRule(index, (next) => { if (checked) next.hidden = true; else delete next.hidden })} />
              <PropertyRow
                label={t('modules.effectColors.timing')}
                hint={t('inspector.conditionsEditor.blinkHold', { blink: t('inspector.hints.conditions.blink'), hold: t('inspector.hints.conditions.hold') })}
                modified={authored(rule.blink_ms, 0) || authored(rule.hold_ms, 0)}
                onReset={() => changeRule(index, (next) => {
                  delete next.blink_ms
                  delete next.hold_ms
                })}
              >
                <div className="grid grid-cols-2 gap-1">
                  <NumberInput title={t('inspector.conditionsEditor.blinkPeriodInMilliseconds0')} value={rule.blink_ms ?? 0} min={0} max={MAXIMUM_BLINK_MS} onChange={(value) => changeRule(index, (next) => {
                    const period = Math.round(value)
                    if (period <= 0) delete next.blink_ms
                    else next.blink_ms = Math.min(MAXIMUM_BLINK_MS, Math.max(MINIMUM_BLINK_MS, period))
                  })} />
                  <NumberInput title={t('inspector.conditionsEditor.holdInMillisecondsAfterThe')} value={rule.hold_ms ?? 0} min={0} max={MAXIMUM_HOLD_MS} onChange={(value) => changeRule(index, (next) => {
                    const hold = Math.round(value)
                    if (hold <= 0) delete next.hold_ms
                    else next.hold_ms = Math.min(MAXIMUM_HOLD_MS, hold)
                  })} />
                </div>
                <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>{t('modules.effectColors.blinkMs')}</span><span>{t('modules.effectColors.holdMs')}</span></div>
              </PropertyRow>
            </div>
          ))}
          {rules.length < MAXIMUM_WIDGET_CONDITIONS ? (
            <button type="button" className="flex h-7 w-full items-center justify-center gap-1 rounded-md border text-foreground hover:bg-muted" onClick={() => update((next) => {
              next.conditions = [...(next.conditions ?? []), { op: 'at_or_above', value: 0 }]
            })}>
              <Plus aria-hidden className="size-3" />
              {t('modules.effectGate.addRule')}</button>
          ) : null}
        </>
      ) : null}
    </Group>
  )
}

function ColorRampEditor({ widget, update, unit }: {
  widget: FramedWidgetConfiguration
  update: (mutation: (next: FramedWidgetConfiguration) => void) => void
  unit?: string
}): React.JSX.Element {
  const stops = widget.color_ramp?.stops ?? []
  const changeStops = (mutation: (list: ColorStop[]) => ColorStop[]): void => update((next) => {
    const list = mutation([...(next.color_ramp?.stops ?? [])])
    if (list.length === 0) {
      delete next.color_ramp
      return
    }
    next.color_ramp = { ...next.color_ramp, stops: list }
  })
  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 font-medium">
          {t('modules.effectPayload.colourRamp')}<InfoHint text={t('inspector.hints.conditions.ramp')} label={t('modules.effectPayload.colourRamp')} />
        </span>
        {stops.length > 0 ? (
          <button type="button" aria-label={t('inspector.conditionsEditor.removeTheColourRamp')} title={t('inspector.conditionsEditor.removeTheColourRamp')} className="rounded-md border p-1 text-muted-foreground hover:text-foreground" onClick={() => update((next) => { delete next.color_ramp })}>
            <Trash2 aria-hidden className="size-3" />
          </button>
        ) : null}
      </div>
      {stops.length > 0 ? (
        <>
          <SelectField label={t('modules.effectEditor.paints')} hint={t('inspector.hints.conditions.rampTarget')} value={widget.color_ramp?.target ?? 'content'} options={COLOR_RAMP_TARGET_VALUES} modified={authored(widget.color_ramp?.target, 'content')} onReset={() => update((next) => { if (next.color_ramp) delete next.color_ramp.target })} onChange={(value) => update((next) => {
            next.color_ramp = { ...next.color_ramp, target: value }
          })} />
          {stops.map((stop, index) => (
            <PropertyRow
              key={index}
              label={`Stop ${index + 1}`}
              modified={authored(stop.at, 0) || authored(stop.color, '#E8E8E8')}
              onReset={() => changeStops((list) => {
                const reset = { ...list[index] }
                delete reset.at
                delete reset.color
                list[index] = reset
                return list
              })}
            >
              <div className="flex items-center gap-1">
                <NumberInput title={unit ? t('inspector.conditionsEditor.atInUnit', { unit: unit }) : t('inspector.conditionsEditor.at')} value={stop.at ?? 0} step="any" onChange={(value) => changeStops((list) => {
                  list[index] = { ...list[index], at: value }
                  return list
                })} />
                <ColorSwatchInput label={`Stop ${index + 1} color`} value={stop.color ?? '#E8E8E8'} onChange={(color) => changeStops((list) => {
                  list[index] = { ...list[index], color }
                  return list
                })} />
                <button type="button" aria-label={`Remove stop ${index + 1}`} title={t('inspector.conditionsEditor.removeThisStop')} className="flex-none rounded-md border p-1.5 text-muted-foreground hover:text-foreground" onClick={() => changeStops((list) => list.filter((_, position) => position !== index))}>
                  <Trash2 aria-hidden className="size-3" />
                </button>
              </div>
            </PropertyRow>
          ))}
          {stops.length < MAXIMUM_COLOR_STOPS ? (
            <button type="button" className="flex h-7 w-full items-center justify-center gap-1 rounded-md border text-foreground hover:bg-muted" onClick={() => changeStops((list) => {
              const previous = list[list.length - 1]
              return [...list, { at: (previous?.at ?? 0) + 1, color: previous?.color ?? '#E8E8E8' }]
            })}>
              <Plus aria-hidden className="size-3" />
              {t('inspector.conditionsEditor.addStop')}</button>
          ) : null}
          {stops.length < 2 ? <Hint>{t('inspector.conditionsEditor.aRampNeedsAtLeast')}</Hint> : null}
        </>
      ) : (
        <button type="button" className="flex h-7 w-full items-center justify-center gap-1 rounded-md border text-foreground hover:bg-muted" onClick={() => changeStops(() => [
          { at: 0, color: '#00C853' },
          { at: 1, color: '#D50000' }
        ])}>
          <Plus aria-hidden className="size-3" />
          {t('inspector.conditionsEditor.addAColourRamp')}</button>
      )}
    </div>
  )
}
