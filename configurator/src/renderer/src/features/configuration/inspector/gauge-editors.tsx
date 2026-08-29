import { Trash2 } from 'lucide-react'
import { ConditionsEditor } from './ConditionsEditor'
import { ARC_MARK_VALUES, type ArcWidgetConfiguration, BAR_ORIENTATION_VALUES, type BarWidgetConfiguration, type GraphTraceConfiguration, type GraphWidgetConfiguration, MAXIMUM_GRAPH_SOURCES, type RgbColor } from '@shared/configuration-schema'
import { fieldBounds } from '@shared/validate/ranges'
import { NEW_GRAPH_BINDING, type WidgetSelection, mutateSelectedWidget } from '../dashboard-editor'
import { authored } from './authored'
import { Advanced, Group } from './Group'
import { HINTS } from './hints'
import { GROUP_ICONS } from './icons'
import { PropertyRow } from './PropertyRow'
import { CheckboxField, ColorField, Hint, NumberField, NumberInput, OptionalColorField, SelectField } from './fields'
import { RingFields } from './ring-editor'
import { ringSummary } from './ring-geometry'
import { SourceRangeFields, SourceRangeSection } from './section-editors'
import { BoxEditor, TitleEditor } from './styling-editors'

import { AddButton } from './widget-editors'

export function ArcEditor({ selection, widget }: { selection: WidgetSelection; widget: ArcWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: ArcWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as ArcWidgetConfiguration))
  return (
    <>
      <SourceRangeSection widget={widget} update={update} />
      <Group id="Arc" title="Arc" icon={GROUP_ICONS.arc} summary={ringSummary(widget)}>
        <RingFields widget={widget} owner="arc" update={update} />
        <SelectField label="Mark" hint={HINTS.arc.mark} value={widget.mark ?? 'ring'} options={ARC_MARK_VALUES} modified={authored(widget.mark, 'ring')} onReset={() => update((next) => { delete next.mark })} onChange={(value) => update((next) => { next.mark = value })} />
        <ColorField label="Fill" value={widget.fill_color ?? '#38BDF8'} modified={authored(widget.fill_color, '#38BDF8')} onReset={() => update((next) => { delete next.fill_color })} onChange={(value) => update((next) => { next.fill_color = value })} />
        <OptionalColorField label="Track" hint={HINTS.arc.track} value={widget.track_color} onChange={(value) => update((next) => { if (value === undefined) delete next.track_color; else next.track_color = value })} />
        <Advanced id="Arc" active={authored(widget.inverted, false)}>
          <CheckboxField label="Invert" hint={HINTS.arc.inverted} checked={widget.inverted ?? false} modified={authored(widget.inverted, false)} onReset={() => update((next) => { delete next.inverted })} onChange={(checked) => update((next) => { if (checked) next.inverted = true; else delete next.inverted })} />
        </Advanced>
      </Group>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

const TRACE_COLORS: readonly [RgbColor, ...RgbColor[]] = ['#00C853', '#FFD200']

function GraphTraceEditor({ trace, index, onChange, onRemove }: {
  trace: GraphTraceConfiguration
  index: number
  onChange: (mutation: (next: GraphTraceConfiguration) => void) => void
  onRemove: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">{`Trace ${index + 2}`}</span>
        <button type="button" aria-label={`Remove trace ${index + 2}`} title="Remove this trace" className="rounded-md border p-1 text-muted-foreground hover:text-foreground" onClick={onRemove}>
          <Trash2 aria-hidden className="size-3" />
        </button>
      </div>
      <SourceRangeFields widget={trace} update={onChange} />
      <ColorField label="Line" value={trace.line_color ?? '#38BDF8'} modified={authored(trace.line_color, '#38BDF8')} onReset={() => onChange((next) => { delete next.line_color })} onChange={(value) => onChange((next) => { next.line_color = value })} />
    </div>
  )
}

export function GraphEditor({ selection, widget }: { selection: WidgetSelection; widget: GraphWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: GraphWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as GraphWidgetConfiguration))
  const points = widget.point_count ?? 64
  const interval = widget.sample_interval_ms ?? 100
  const traces = widget.traces ?? []
  return (
    <>
      <SourceRangeSection widget={widget} update={update}>
        <ColorField label="Line" value={widget.line_color ?? '#38BDF8'} modified={authored(widget.line_color, '#38BDF8')} onReset={() => update((next) => { delete next.line_color })} onChange={(value) => update((next) => { next.line_color = value })} />
      </SourceRangeSection>
      <Group id="Traces" title="More traces" icon={GROUP_ICONS.graph} hint={HINTS.graph.traces} summary={`${traces.length + 1} of ${MAXIMUM_GRAPH_SOURCES}`} defaultOpen={traces.length > 0}>
        {traces.map((trace, index) => (
          <GraphTraceEditor
            key={index}
            trace={trace}
            index={index}
            onChange={(mutation) => update((next) => {
              const list = next.traces ?? []
              if (list[index]) mutation(list[index])
            })}
            onRemove={() => update((next) => {
              next.traces = (next.traces ?? []).filter((_, position) => position !== index)
            })}
          />
        ))}
        {traces.length + 1 < MAXIMUM_GRAPH_SOURCES ? (
          <AddButton label="Add trace" onClick={() => update((next) => {
            const list = next.traces ?? []
            next.traces = [...list, { source: { binding: NEW_GRAPH_BINDING }, line_color: TRACE_COLORS[list.length] ?? TRACE_COLORS[0] }]
          })} />
        ) : <Hint>{`A graph draws at most ${MAXIMUM_GRAPH_SOURCES} sources on one plot.`}</Hint>}
      </Group>
      <Group id="Plot" title="Plot" icon={GROUP_ICONS.graph} summary={`${((points * interval) / 1000).toFixed(1)} s`}>
        <PropertyRow
          label="Window"
          hint={HINTS.graph.points}
          modified={authored(widget.point_count, 64) || authored(widget.sample_interval_ms, 100)}
          onReset={() => update((next) => {
            delete next.point_count
            delete next.sample_interval_ms
          })}
        >
          <div className="grid grid-cols-2 gap-1">
            <NumberInput title="How many samples each trace keeps" value={points} {...fieldBounds('graph', 'point_count')} onChange={(value) => update((next) => { next.point_count = value })} />
            <NumberInput title="Milliseconds between samples" value={interval} {...fieldBounds('graph', 'sample_interval_ms')} onChange={(value) => update((next) => { next.sample_interval_ms = value })} />
          </div>
          <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>Points</span><span>Interval (ms)</span></div>
        </PropertyRow>
        <p className="text-muted-foreground">{`Shows the last ${((points * interval) / 1000).toFixed(1)} s.`}</p>
        <NumberField label="Line width" hint={HINTS.graph.width} suffix="px" value={widget.line_width_px ?? 2} {...fieldBounds('graph', 'line_width_px')} modified={authored(widget.line_width_px, 2)} onReset={() => update((next) => { delete next.line_width_px })} onChange={(value) => update((next) => { next.line_width_px = value })} />
      </Group>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

export function BarEditor({ selection, widget }: { selection: WidgetSelection; widget: BarWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: BarWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as BarWidgetConfiguration))
  return (
    <>
      <SourceRangeSection widget={widget} update={update}>
        <CheckboxField label="From origin" hint={HINTS.bar.origin} checked={widget.origin !== undefined} modified={widget.origin !== undefined} onReset={() => update((next) => { delete next.origin })} onChange={(checked) => update((next) => { if (checked) next.origin = 0; else delete next.origin })} />
        {widget.origin !== undefined ? (
          <NumberField label="Origin" value={widget.origin} step="any" modified={authored(widget.origin, 0)} onReset={() => update((next) => { next.origin = 0 })} onChange={(value) => update((next) => { next.origin = value })} />
        ) : null}
      </SourceRangeSection>
      <Group id="Bar" title="Bar" icon={GROUP_ICONS.bar} summary={widget.orientation ?? 'horizontal'}>
        <SelectField label="Orientation" value={widget.orientation ?? 'horizontal'} options={BAR_ORIENTATION_VALUES} modified={authored(widget.orientation, 'horizontal')} onReset={() => update((next) => { delete next.orientation })} onChange={(value) => update((next) => { next.orientation = value })} />
        <ColorField label="Fill" hint={HINTS.bar.fill} value={widget.fill_color ?? '#38BDF8'} modified={authored(widget.fill_color, '#38BDF8')} onReset={() => update((next) => { delete next.fill_color })} onChange={(value) => update((next) => { next.fill_color = value })} />
        <OptionalColorField
          label="Gradient to"
          value={widget.fill_grad_color}
          onChange={(value) =>
            update((next) => {
              if (value) next.fill_grad_color = value
              else delete next.fill_grad_color
            })
          }
        />
        <Advanced id="Bar" active={authored(widget.inverted, false)}>
          <CheckboxField label="Invert" hint={HINTS.bar.inverted} checked={widget.inverted ?? false} modified={authored(widget.inverted, false)} onReset={() => update((next) => { delete next.inverted })} onChange={(checked) => update((next) => { if (checked) next.inverted = true; else delete next.inverted })} />
        </Advanced>
      </Group>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}
