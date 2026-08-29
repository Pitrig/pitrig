import { ConditionsEditor } from './ConditionsEditor'
import { BAR_ORIENTATION_VALUES, INDICATOR_SHAPE_VALUES, type IndicatorWidgetConfiguration, MAXIMUM_INDICATOR_SEGMENTS } from '@shared/configuration-schema'
import { fieldBounds } from '@shared/validate/ranges'
import { type WidgetSelection, mutateSelectedWidget } from '../dashboard-editor'
import { authored } from './authored'
import { Advanced, Group } from './Group'
import { HINTS } from './hints'
import { GROUP_ICONS } from './icons'
import { PropertyRow } from './PropertyRow'
import { CheckboxField, ColorSwatchInput, Hint, NumberInput, OptionalColorField, SelectField } from './fields'
import { RingFields } from './ring-editor'
import { ringSummary } from './ring-geometry'
import { SourceRangeSection } from './section-editors'
import { BoxEditor, TitleEditor } from './styling-editors'
import { AddButton, RemoveButton } from './widget-editors'

export function IndicatorEditor({ selection, widget }: { selection: WidgetSelection; widget: IndicatorWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: IndicatorWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as IndicatorWidgetConfiguration))
  const segments = widget.segments ?? []
  const arcShape = (widget.shape ?? 'strip') === 'arc'
  return (
    <>
      <SourceRangeSection widget={widget} update={update} />
      <Group id="Strip" title="Strip" icon={GROUP_ICONS.strip} summary={arcShape ? `arc ${ringSummary(widget)}` : (widget.orientation ?? 'horizontal')}>
        <SelectField label="Shape" hint={HINTS.strip.shape} value={widget.shape ?? 'strip'} options={INDICATOR_SHAPE_VALUES} modified={authored(widget.shape, 'strip')} onReset={() => update((next) => { delete next.shape })} onChange={(value) => update((next) => { next.shape = value })} />
        {arcShape ? (
          <RingFields widget={widget} owner="indicator" update={update} />
        ) : (
          <SelectField label="Orientation" value={widget.orientation ?? 'horizontal'} options={BAR_ORIENTATION_VALUES} modified={authored(widget.orientation, 'horizontal')} onReset={() => update((next) => { delete next.orientation })} onChange={(value) => update((next) => { next.orientation = value })} />
        )}
        <PropertyRow
          label="Lamps"
          hint={HINTS.strip.gap}
          modified={authored(widget.segment_gap_px, 4) || authored(widget.segment_radius_px, 0)}
          onReset={() => update((next) => {
            delete next.segment_gap_px
            delete next.segment_radius_px
          })}
        >
          <div className="grid grid-cols-2 gap-1">
            <NumberInput title="Gap between lamps in pixels" value={widget.segment_gap_px ?? 4} min={0} onChange={(value) => update((next) => { next.segment_gap_px = value })} />
            <NumberInput title={arcShape ? 'Non-zero rounds the lamp ends' : 'Lamp corner radius in pixels'} value={widget.segment_radius_px ?? 0} min={0} onChange={(value) => update((next) => { next.segment_radius_px = value })} />
          </div>
          <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>Gap</span><span>Radius</span></div>
        </PropertyRow>
        <OptionalColorField label="Unlit" hint={HINTS.strip.off} value={widget.off_color} onChange={(value) => update((next) => { if (value === undefined) delete next.off_color; else next.off_color = value })} />
        <Advanced id="Strip" active={authored(widget.blink_threshold, 2) || authored(widget.blink_ms, 0) || authored(widget.inverted, false)}>
          <CheckboxField label="Invert" hint={HINTS.strip.inverted} checked={widget.inverted ?? false} modified={authored(widget.inverted, false)} onReset={() => update((next) => { delete next.inverted })} onChange={(checked) => update((next) => { if (checked) next.inverted = true; else delete next.inverted })} />
          <PropertyRow
            label="Blink"
            hint={HINTS.strip.blink}
            modified={authored(widget.blink_threshold, 2) || authored(widget.blink_ms, 0)}
            onReset={() => update((next) => {
              delete next.blink_threshold
              delete next.blink_ms
            })}
          >
            <div className="grid grid-cols-2 gap-1">
              <NumberInput title="Blink from this fraction of the range" value={widget.blink_threshold ?? 2} step="any" onChange={(value) => update((next) => { next.blink_threshold = value })} />
              <NumberInput title="Blink period in milliseconds" value={widget.blink_ms ?? 0} {...fieldBounds('indicator', 'blink_ms')} onChange={(value) => update((next) => { next.blink_ms = value })} />
            </div>
            <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>From</span><span>Period (ms)</span></div>
          </PropertyRow>
        </Advanced>
      </Group>
      <Group id="Segments" title="Segments" icon={GROUP_ICONS.segments} hint={HINTS.strip.segments} summary={`${segments.length} lamp(s)`}>
        {segments.map((segment, index) => (
          <PropertyRow
            key={index}
            label={`Lamp ${index + 1}`}
            modified={authored(segment.threshold, 0) || authored(segment.color, '#00C853')}
            onReset={() => update((next) => {
              const list = [...(next.segments ?? [])]
              const lamp = { ...list[index] }
              delete lamp.threshold
              delete lamp.color
              list[index] = lamp
              next.segments = list
            })}
          >
            <div className="flex items-center gap-1">
              <NumberInput title={`Lamp ${index + 1} lights at this fraction of the range`} value={segment.threshold ?? 0} step="any" min={0} max={1} onChange={(value) => update((next) => {
                const list = [...(next.segments ?? [])]
                list[index] = { ...list[index], threshold: value }
                next.segments = list
              })} />
              <ColorSwatchInput label={`Lamp ${index + 1} color`} value={segment.color ?? '#00C853'} onChange={(color) => update((next) => {
                const list = [...(next.segments ?? [])]
                list[index] = { ...list[index], color }
                next.segments = list
              })} />
              <RemoveButton label={`Remove lamp ${index + 1}`} onClick={() => update((next) => {
                next.segments = (next.segments ?? []).filter((_, position) => position !== index)
              })} />
            </div>
          </PropertyRow>
        ))}
        {segments.length < MAXIMUM_INDICATOR_SEGMENTS ? (
          <AddButton label="Add lamp" onClick={() => update((next) => {
            const list = next.segments ?? []
            const previous = list[list.length - 1]
            next.segments = [...list, { threshold: previous?.threshold ?? 0, color: previous?.color ?? '#00C853' }]
          })} />
        ) : <Hint>{`A strip holds at most ${MAXIMUM_INDICATOR_SEGMENTS} lamps.`}</Hint>}
      </Group>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}
