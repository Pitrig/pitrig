import type { FramedWidget } from './types'
import { COLOR_RAMP_TARGET_VALUES, CONDITION_OPERATOR_VALUES, type ColorRampTarget, type ColorStop, type ConditionOperator, GRADIENT_DIRECTION_VALUES, type GradientDirection, MAXIMUM_COLOR_STOPS, MAXIMUM_WIDGET_CONDITIONS, TEXT_ALIGNMENT_VALUES, type TextAlignment, type WidgetCondition, type WidgetTitleStyle } from '../../../../../shared/configuration-schema'
import { TELEMETRY_CATALOG } from '../../../../../shared/telemetry-catalog'
import { BOOLEAN_OPERATORS, MAXIMUM_BLINK_MS, MAXIMUM_HOLD_MS, MINIMUM_BLINK_MS } from '../../../../../shared/widget-conditions'
import { DEFAULT_CAPTION_FONT_SIZE_PX, draftFontFamily } from '../dashboard-editor'
import { TelemetryBindingField } from './TelemetryBindingField'
import { CheckboxField, ColorField, FontEditor, Hint, NumberField, OptionalColorField, Section, SelectField, TextField } from './fields'
import { useDeviceStore } from '@/features/device/device-store'

export function TitleEditor({ widget, update }: {
  widget: FramedWidget
  update: (mutation: (next: FramedWidget) => void) => void
}): React.JSX.Element {
  const borderWidth = widget.border?.width_px ?? 0
  const borderGap = widget.title?.border_gap ?? true
  return (
    <Section title="Title">
      <p className="text-muted-foreground">The caption is anchored to an edge of the widget&apos;s box and moved from there by the offsets. It cuts the border line wherever it crosses one, which is what gives a panel its label.</p>
      {/* A caption needs a font the moment it has text, and the device rejects
          the whole document over a fontless one. The first family the dashboard
          already uses is one the board is being asked for anyway, so adopting it
          keeps a new caption from invalidating the draft. */}
      <TextField label="Text" value={widget.title?.text ?? ''} onChange={(value) => update((next) => {
        const font = next.title?.font?.family
          ? next.title.font
          : {
              family: draftFontFamily(useDeviceStore.getState().draft),
              size_px: DEFAULT_CAPTION_FONT_SIZE_PX
            }
        next.title = { ...next.title, text: value, ...(value ? { font } : {}) }
      })} />
      {/* Every control below writes its property only when it differs from the
          device's own default, so a caption that sits where captions have always
          sat still costs one `text` and one `font` in the document. */}
      {widget.title?.text ? (
        <>
          <FontEditor font={widget.title.font} onChange={(font) => update((next) => { next.title = { ...next.title, font } })} />
          <ColorField label="Color" value={widget.title.color ?? '#E8E8E8'} onChange={(value) => update((next) => { next.title = { ...next.title, color: value } })} />
          <SelectField label="Alignment" value={widget.title.alignment ?? 'center'} options={TEXT_ALIGNMENT_VALUES} onChange={(value) => update((next) => {
            const title: WidgetTitleStyle = { ...next.title, alignment: value as TextAlignment }
            if (title.alignment === 'center') delete title.alignment
            next.title = title
          })} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X offset" value={widget.title.offset_x_px ?? 0} onChange={(value) => update((next) => {
              const title: WidgetTitleStyle = { ...next.title, offset_x_px: value }
              if (value === 0) delete title.offset_x_px
              next.title = title
            })} />
            <NumberField label="Y offset" value={widget.title.offset_y_px ?? 0} onChange={(value) => update((next) => { next.title = { ...next.title, offset_y_px: value } })} />
          </div>
          <CheckboxField label="Cut border" checked={borderGap} onChange={(checked) => update((next) => {
            const title: WidgetTitleStyle = { ...next.title, border_gap: checked }
            if (checked) delete title.border_gap
            next.title = title
          })} />
          {borderWidth > 0 && borderGap ? (
            <>
              <NumberField label="Gap padding" value={widget.title.gap_padding_px ?? 4} min={0} max={240} onChange={(value) => update((next) => {
                const padding = Math.max(0, Math.round(value))
                const title: WidgetTitleStyle = { ...next.title, gap_padding_px: padding }
                if (padding === 4) delete title.gap_padding_px
                next.title = title
              })} />
              {(widget.border?.radius_px ?? 0) > 0 && (widget.title.alignment ?? 'center') !== 'center' ? (
                <Hint>The cut is a straight band, so a caption pushed into a rounded corner takes a bite out of it. Offset it by about the radius plus the border width to clear the curve.</Hint>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </Section>
  )
}

export function BoxEditor({ widget, update }: {
  widget: FramedWidget
  update: (mutation: (next: FramedWidget) => void) => void
}): React.JSX.Element {
  return (
    <Section title="Box">
      <OptionalColorField label="Background" value={widget.background_color} onChange={(value) => update((next) => { if (value) next.background_color = value; else delete next.background_color })} />
      <div className="grid grid-cols-2 gap-2">{(['left', 'top', 'right', 'bottom'] as const).map((key) => <NumberField key={key} label={`Padding ${key}`} value={widget.padding?.[key] ?? 0} min={0} onChange={(value) => update((next) => { next.padding = { ...next.padding, [key]: value } })} />)}</div>
      <div className="grid grid-cols-2 gap-2"><NumberField label="Border width" value={widget.border?.width_px ?? 0} min={0} onChange={(value) => update((next) => { next.border = { ...next.border, width_px: value } })} /><NumberField label="Radius" value={widget.border?.radius_px ?? 0} min={0} onChange={(value) => update((next) => { next.border = { ...next.border, radius_px: value } })} /></div>
      <NumberField label="Background inset" value={widget.background_inset_px ?? 0} min={0} onChange={(value) => update((next) => {
        const inset = Math.max(0, Math.round(value))
        if (inset === 0) delete next.background_inset_px
        else next.background_inset_px = inset
      })} />
      <ColorField label="Border color" value={widget.border?.color ?? '#AEAEAE'} onChange={(value) => update((next) => { next.border = { ...next.border, color: value } })} />
      {/* A gradient is the far end of the background plus an axis; without a
          background there is nothing for it to run across, so it only appears
          once one is set. On the ESP32-P4 a gradient fill falls back to the
          software renderer — a performance note, not a correctness one. */}
      {widget.background_color ? (
        <>
          <OptionalColorField
            label="Background gradient to"
            value={widget.background_grad_color}
            onChange={(value) =>
              update((next) => {
                if (value) next.background_grad_color = value
                else {
                  delete next.background_grad_color
                  delete next.background_grad_dir
                }
              })
            }
          />
          {widget.background_grad_color ? (
            <SelectField
              label="Gradient axis"
              value={widget.background_grad_dir ?? 'vertical'}
              options={GRADIENT_DIRECTION_VALUES}
              onChange={(value) =>
                update((next) => {
                  next.background_grad_dir = value as GradientDirection
                })
              }
            />
          ) : null}
        </>
      ) : null}
    </Section>
  )
}

export function ConditionsEditor({ widget, update }: {
  widget: FramedWidget
  update: (mutation: (next: FramedWidget) => void) => void
}): React.JSX.Element {
  const watched = widget.condition_source?.binding ?? ''
  const field = TELEMETRY_CATALOG.find(({ name }) => name === watched)
  // A boolean field has nothing to be above or below, so the editor offers the
  // two states it can actually take.
  const boolean = field?.type === 'boolean'
  const operators = boolean ? BOOLEAN_OPERATORS : CONDITION_OPERATOR_VALUES
  const rules = widget.conditions ?? []
  const changeRule = (index: number, mutation: (rule: WidgetCondition) => void): void => update((next) => {
    const list = next.conditions ?? []
    if (list[index]) mutation(list[index])
  })
  return (
    <Section title="Conditions">
      <p className="text-muted-foreground">
        The watched field is independent of what the widget shows, so a gear readout can
        turn red on engine speed. A colour ramp moves the colour smoothly with the value;
        the first rule that holds paints over it, and anything a rule leaves unset stays
        as authored. Switch the preview to live values to watch both.
      </p>
      <TelemetryBindingField value={watched} onChange={(value) => update((next) => {
        if (!value) {
          delete next.condition_source
          delete next.conditions
          return
        }
        next.condition_source = { ...next.condition_source, binding: value }
        // Thresholds follow the data: switching to a boolean field leaves no
        // meaning in "above 0.9", so the rules move to the states it has.
        const selected = TELEMETRY_CATALOG.find(({ name }) => name === value)
        if (selected?.type !== 'boolean') return
        for (const rule of next.conditions ?? []) {
          if (!BOOLEAN_OPERATORS.includes(rule.op ?? 'at_or_above')) rule.op = 'equal'
          rule.value = (rule.value ?? 0) >= 1 ? 1 : 0
        }
      })} />
      {/* The value sources have carried a modifier since the lap timer existed;
          the watched source could only ever be a raw field, so a rule could not
          be written against lap time at all. */}
      {watched ? (
        <SelectField
          label="Modifier"
          value={
            widget.condition_source?.modifiers?.some(({ type }) => type === 'lap_timer')
              ? 'lap_timer'
              : 'none'
          }
          options={['none', 'lap_timer']}
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
                <span className="font-medium">Rule {index + 1}</span>
                <button type="button" className="rounded-md border px-2 py-0.5 text-foreground" onClick={() => update((next) => {
                  next.conditions = (next.conditions ?? []).filter((_, position) => position !== index)
                  if (next.conditions.length === 0) delete next.conditions
                })}>
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SelectField label="When value is" value={rule.op ?? 'at_or_above'} options={operators} onChange={(value) => changeRule(index, (next) => { next.op = value as ConditionOperator })} />
                {boolean ? (
                  <SelectField label="State" value={(rule.value ?? 0) >= 1 ? 'true' : 'false'} options={['true', 'false']} onChange={(value) => changeRule(index, (next) => { next.value = value === 'true' ? 1 : 0 })} />
                ) : (
                  <NumberField label={field?.unit && field.unit !== 'source' ? `Threshold (${field.unit})` : 'Threshold'} value={rule.value ?? 0} step="any" onChange={(value) => changeRule(index, (next) => { next.value = value })} />
                )}
              </div>
              <OptionalColorField label="Value color" value={rule.color} onChange={(value) => changeRule(index, (next) => { if (value) next.color = value; else delete next.color })} />
              <OptionalColorField label="Background" value={rule.background_color} onChange={(value) => changeRule(index, (next) => { if (value) next.background_color = value; else delete next.background_color })} />
              <OptionalColorField label="Border color" value={rule.border_color} onChange={(value) => changeRule(index, (next) => { if (value) next.border_color = value; else delete next.border_color })} />
              <CheckboxField label="Hide the widget" checked={rule.hidden ?? false} onChange={(checked) => changeRule(index, (next) => { if (checked) next.hidden = true; else delete next.hidden })} />
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Blink period (ms, 0 = steady)" value={rule.blink_ms ?? 0} min={0} max={MAXIMUM_BLINK_MS} onChange={(value) => changeRule(index, (next) => {
                  const period = Math.round(value)
                  if (period <= 0) delete next.blink_ms
                  else next.blink_ms = Math.min(MAXIMUM_BLINK_MS, Math.max(MINIMUM_BLINK_MS, period))
                })} />
                <NumberField label="Hold after (ms, 0 = while true)" value={rule.hold_ms ?? 0} min={0} max={MAXIMUM_HOLD_MS} onChange={(value) => changeRule(index, (next) => {
                  const hold = Math.round(value)
                  if (hold <= 0) delete next.hold_ms
                  else next.hold_ms = Math.min(MAXIMUM_HOLD_MS, hold)
                })} />
              </div>
            </div>
          ))}
          {rules.length < MAXIMUM_WIDGET_CONDITIONS ? (
            <button type="button" className="h-8 w-full rounded-md border text-foreground" onClick={() => update((next) => {
              next.conditions = [...(next.conditions ?? []), { op: 'at_or_above', value: 0 }]
            })}>
              Add rule
            </button>
          ) : null}
        </>
      ) : null}
    </Section>
  )
}

// The ramp is the layer under the rules, so it is edited with them rather than
// in a section of its own.
function ColorRampEditor({ widget, update, unit }: {
  widget: FramedWidget
  update: (mutation: (next: FramedWidget) => void) => void
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
        <span className="font-medium">Colour ramp</span>
        {stops.length > 0 ? (
          <button type="button" className="rounded-md border px-2 py-0.5 text-foreground" onClick={() => update((next) => { delete next.color_ramp })}>
            Remove
          </button>
        ) : null}
      </div>
      {stops.length > 0 ? (
        <>
          <SelectField label="Paints" value={widget.color_ramp?.target ?? 'content'} options={COLOR_RAMP_TARGET_VALUES} onChange={(value) => update((next) => {
            next.color_ramp = { ...next.color_ramp, target: value as ColorRampTarget }
          })} />
          {stops.map((stop, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <NumberField label={unit ? `At (${unit})` : 'At'} value={stop.at ?? 0} step="any" onChange={(value) => changeStops((list) => {
                list[index] = { ...list[index], at: value }
                return list
              })} />
              <ColorField label="Color" value={stop.color ?? '#E8E8E8'} onChange={(value) => changeStops((list) => {
                list[index] = { ...list[index], color: value }
                return list
              })} />
              <button type="button" className="h-8 rounded-md border px-2 text-foreground" onClick={() => changeStops((list) => list.filter((_, position) => position !== index))}>
                Remove
              </button>
            </div>
          ))}
          {stops.length < MAXIMUM_COLOR_STOPS ? (
            <button type="button" className="h-8 w-full rounded-md border text-foreground" onClick={() => changeStops((list) => {
              const previous = list[list.length - 1]
              return [...list, { at: (previous?.at ?? 0) + 1, color: previous?.color ?? '#E8E8E8' }]
            })}>
              Add stop
            </button>
          ) : null}
          {stops.length < 2 ? <Hint>A ramp needs at least two stops to interpolate between.</Hint> : null}
        </>
      ) : (
        <button type="button" className="h-8 w-full rounded-md border text-foreground" onClick={() => changeStops(() => [
          { at: 0, color: '#00C853' },
          { at: 1, color: '#D50000' }
        ])}>
          Add a colour ramp
        </button>
      )}
    </div>
  )
}
