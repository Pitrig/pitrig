import { Plus, Trash2 } from 'lucide-react'
import { ConditionsEditor } from './ConditionsEditor'
import { SlotPagesEditor } from './SlotPagesEditor'
import { pagesOf, widgetsOf } from '@shared/configuration-access'
import { type ArcWidgetConfiguration, BAR_ORIENTATION_VALUES, type BarWidgetConfiguration, type GraphTraceConfiguration, type GraphWidgetConfiguration, type ImageWidgetConfiguration, type IndicatorWidgetConfiguration, MAXIMUM_GRAPH_SOURCES, MAXIMUM_INDICATOR_SEGMENTS, MAXIMUM_TEXT_SOURCES, type RgbColor, SHAPE_KIND_VALUES, type ShapeWidgetConfiguration, type SlotWidgetConfiguration, TEXT_ALIGNMENT_VALUES, type TextWidgetConfiguration } from '@shared/configuration-schema'
import { fieldBounds } from '@shared/validate/ranges'
import { DEFAULT_WIDGET_FONT_SIZE_PX, NEW_GRAPH_BINDING, type WidgetSelection, mutateSelectedWidget } from '../dashboard-editor'
import { SourceEditor, TelemetryBindingField } from './TelemetryBindingField'
import { authored } from './authored'
import { Advanced, Group } from './Group'
import { HINTS } from './hints'
import { GROUP_ICONS } from './icons'
import { PropertyRow } from './PropertyRow'
import { CheckboxField, ColorField, ColorSwatchInput, FontEditor, Hint, NumberField, NumberInput, OptionalColorField, SelectField, TextField } from './fields'
import { ContainerEditor, SourceRangeFields, SourceRangeSection } from './section-editors'
import { BoxEditor, TitleEditor } from './styling-editors'
import { useDeviceStore } from '@/features/device/device-store'

/**
 * One editor per widget type, each a list of groups in the same order: what it
 * reads, what it is, what it says, what it looks like, and what a value does to
 * it. The frame it stands in — its name, its box, its geometry and its action —
 * is added around these by the inspector, because every type carries it.
 */

/** The button every list of repeated rows adds with. */
function AddButton({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <button type="button" className="flex h-7 w-full items-center justify-center gap-1 rounded-md border text-foreground hover:bg-muted" onClick={onClick}>
      <Plus aria-hidden className="size-3" />
      {label}
    </button>
  )
}

function RemoveButton({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} className="flex-none rounded-md border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40" onClick={onClick}>
      <Trash2 aria-hidden className="size-3" />
    </button>
  )
}

export function ArcEditor({ selection, widget }: { selection: WidgetSelection; widget: ArcWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: ArcWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as ArcWidgetConfiguration))
  return (
    <>
      <SourceRangeSection widget={widget} update={update} />
      <Group id="Arc" title="Arc" icon={GROUP_ICONS.arc} summary={`${widget.start_angle_deg ?? 135}° + ${widget.sweep_deg ?? 270}°`}>
        <PropertyRow
          label="Angles"
          hint={HINTS.arc.angles}
          modified={authored(widget.start_angle_deg, 135) || authored(widget.sweep_deg, 270)}
          onReset={() => update((next) => {
            delete next.start_angle_deg
            delete next.sweep_deg
          })}
        >
          <div className="grid grid-cols-2 gap-1">
            <NumberInput title="Start angle in degrees" value={widget.start_angle_deg ?? 135} {...fieldBounds('arc', 'start_angle_deg')} onChange={(value) => update((next) => { next.start_angle_deg = value })} />
            <NumberInput title="Sweep in degrees" value={widget.sweep_deg ?? 270} {...fieldBounds('arc', 'sweep_deg')} onChange={(value) => update((next) => { next.sweep_deg = value })} />
          </div>
          <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>Start</span><span>Sweep</span></div>
        </PropertyRow>
        <NumberField label="Thickness" hint={HINTS.arc.thickness} suffix="px" value={widget.thickness_px ?? 8} {...fieldBounds('arc', 'thickness_px')} modified={authored(widget.thickness_px, 8)} onReset={() => update((next) => { delete next.thickness_px })} onChange={(value) => update((next) => { next.thickness_px = value })} />
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

export function IndicatorEditor({ selection, widget }: { selection: WidgetSelection; widget: IndicatorWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: IndicatorWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as IndicatorWidgetConfiguration))
  const segments = widget.segments ?? []
  return (
    <>
      <SourceRangeSection widget={widget} update={update} />
      <Group id="Strip" title="Strip" icon={GROUP_ICONS.strip} summary={widget.orientation ?? 'horizontal'}>
        <SelectField label="Orientation" value={widget.orientation ?? 'horizontal'} options={BAR_ORIENTATION_VALUES} modified={authored(widget.orientation, 'horizontal')} onReset={() => update((next) => { delete next.orientation })} onChange={(value) => update((next) => { next.orientation = value })} />
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
            <NumberInput title="Lamp corner radius in pixels" value={widget.segment_radius_px ?? 0} min={0} onChange={(value) => update((next) => { next.segment_radius_px = value })} />
          </div>
          <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>Gap</span><span>Radius</span></div>
        </PropertyRow>
        <OptionalColorField label="Unlit" hint={HINTS.strip.off} value={widget.off_color} onChange={(value) => update((next) => { if (value === undefined) delete next.off_color; else next.off_color = value })} />
        <Advanced id="Strip" active={authored(widget.blink_threshold, 2) || authored(widget.blink_ms, 0)}>
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

export function ImageEditor({ selection, widget }: { selection: WidgetSelection; widget: ImageWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: ImageWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as ImageWidgetConfiguration))
  const installed = useDeviceStore((state) => state.session?.imageAssets?.images) ?? []
  const known = installed.find(({ name }) => name === widget.image)
  // A sheet is what makes the frame controls mean anything, and only the board
  // knows how many frames an image has. With nothing connected they stay hidden
  // rather than offering a range nobody can check.
  const frames = known?.frameCount ?? 1
  const sheet = frames > 1
  const frameBinding = widget.sprite_frame_source?.binding ?? ''
  return (
    <>
      <Group id="Image" title="Image" icon={GROUP_ICONS.image} summary={widget.image || 'Unassigned'}>
        <SelectField label="Bitmap" hint={HINTS.image.image} block value={widget.image ?? ''} options={['', ...installed.map(({ name }) => name)]} modified={authored(widget.image, '')} onReset={() => update((next) => { delete next.image })} onChange={(value) => update((next) => { if (value) next.image = value; else delete next.image })} />
        {installed.length === 0 ? <Hint>Upload images to the board to choose one here.</Hint> : null}
        {widget.image && !known && installed.length > 0 ? <Hint>{`"${widget.image}" is not installed on the connected board, so the device will refuse this configuration.`}</Hint> : null}
        {known ? <p className="text-muted-foreground">{`${known.width} × ${known.height} · ${known.format}${sheet ? ` · ${frames} frames` : ''}`}</p> : null}
        {sheet ? (
          <>
            <TelemetryBindingField label="Frame from" hint={HINTS.image.frameSource} value={frameBinding} onReset={() => update((next) => { delete next.sprite_frame_source })} onChange={(value) => update((next) => {
              if (!value) { delete next.sprite_frame_source; return }
              next.sprite_frame_source = { ...next.sprite_frame_source, binding: value }
              // The two are alternatives, and the source wins on the device, so
              // leaving a frame authored underneath it would only mislead.
              delete next.sprite_frame
            })} />
            {frameBinding ? null : (
              <NumberField label="Frame" hint={HINTS.image.frame} value={widget.sprite_frame ?? 0} min={0} max={frames - 1} modified={authored(widget.sprite_frame, 0)} onReset={() => update((next) => { delete next.sprite_frame })} onChange={(value) => update((next) => { next.sprite_frame = Math.min(frames - 1, Math.max(0, Math.round(value))) })} />
            )}
          </>
        ) : null}
        {!sheet && (widget.sprite_frame || widget.sprite_frame_source) ? <Hint>{`"${widget.image}" has a single frame, so the device will refuse a frame or a frame source on it.`}</Hint> : null}
        <OptionalColorField label="Recolor" hint={HINTS.image.recolor} value={widget.recolor} onChange={(value) => update((next) => { if (value) next.recolor = value; else { delete next.recolor; delete next.recolor_opa } })} />
        {widget.recolor ? <NumberField label="Strength" hint={HINTS.image.strength} value={widget.recolor_opa ?? 255} min={0} max={255} modified={authored(widget.recolor_opa, 255)} onReset={() => update((next) => { delete next.recolor_opa })} onChange={(value) => update((next) => { next.recolor_opa = Math.min(255, Math.max(0, Math.round(value))) })} /> : null}
      </Group>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

/** What a second and a third trace start out as, so they read apart at a glance. */
const TRACE_COLORS: readonly [RgbColor, ...RgbColor[]] = ['#00C853', '#FFD200']

/**
 * One of the sources a graph draws beside its own. It carries exactly what the
 * widget's own trace carries — what it reads, through what window, in what
 * colour — through the same fields, so neither of the two is the special case
 * and a trace added here cannot drift from the one above it.
 */
function GraphTraceEditor({ trace, index, onChange, onRemove }: {
  trace: GraphTraceConfiguration
  index: number
  onChange: (mutation: (next: GraphTraceConfiguration) => void) => void
  onRemove: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex items-center justify-between">
        {/* The widget's own source is trace 1, so these start at two. */}
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
      {/* The widget's own source is the first trace, so its colour sits with
          its binding and its window rather than with the plot below. */}
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
            // Both properties are answered here rather than left to the
            // contract's defaults: an unnamed source is the empty string, which
            // the device refuses outright, and an uncoloured trace would be
            // drawn in the same blue as the one above it — which is the one
            // thing a second trace must not be.
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
      {/* A bar is the one gauge that may fill from somewhere other than its
          minimum, so its data group carries the origin the others have no use
          for. */}
      <SourceRangeSection widget={widget} update={update}>
        <CheckboxField label="From origin" hint={HINTS.bar.origin} checked={widget.origin !== undefined} modified={widget.origin !== undefined} onReset={() => update((next) => { delete next.origin })} onChange={(checked) => update((next) => { if (checked) next.origin = 0; else delete next.origin })} />
        {widget.origin !== undefined ? (
          <NumberField label="Origin" value={widget.origin} step="any" modified={authored(widget.origin, 0)} onReset={() => update((next) => { next.origin = 0 })} onChange={(value) => update((next) => { next.origin = value })} />
        ) : null}
      </SourceRangeSection>
      <Group id="Bar" title="Bar" icon={GROUP_ICONS.bar} summary={widget.orientation ?? 'horizontal'}>
        <SelectField label="Orientation" value={widget.orientation ?? 'horizontal'} options={BAR_ORIENTATION_VALUES} modified={authored(widget.orientation, 'horizontal')} onReset={() => update((next) => { delete next.orientation })} onChange={(value) => update((next) => { next.orientation = value })} />
        <ColorField label="Fill" hint={HINTS.bar.fill} value={widget.fill_color ?? '#38BDF8'} modified={authored(widget.fill_color, '#38BDF8')} onReset={() => update((next) => { delete next.fill_color })} onChange={(value) => update((next) => { next.fill_color = value })} />
        {/* The fill's gradient runs along the bar's own axis, so it needs no
            direction of its own. */}
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

// A shape is its frame, so its own group is one property; the box and the
// styling rules come from the shared frame editors below.
export function ShapeEditor({ selection, widget }: { selection: WidgetSelection; widget: ShapeWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: ShapeWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as ShapeWidgetConfiguration))
  const held = widgetsOf(widget).length
  return (
    <>
      <Group id="Shape" title="Shape" icon={GROUP_ICONS.shape} summary={widget.kind ?? 'rectangle'}>
        <SelectField label="Kind" hint={HINTS.shape.kind} value={widget.kind ?? 'rectangle'} options={SHAPE_KIND_VALUES} modified={authored(widget.kind, 'rectangle')} onReset={() => update((next) => { delete next.kind })} onChange={(value) => update((next) => { next.kind = value })} />
      </Group>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
      {/* A shape holds widgets, so it gets the group that says what holding
          them means. */}
      <ContainerEditor
        widget={widget}
        update={update}
        count={held}
        summary={
          held === 0
            ? 'This shape holds no widgets. Select some and wrap them to make it a container; an empty one with an action is an invisible tap zone.'
            : `Holds ${held} widget(s), placed relative to this box.`
        }
      />
    </>
  )
}

/**
 * A slot is an area that switches what it shows. It draws nothing, so it has no
 * frame editors at all — the device refuses a slot with an appearance — and its
 * only properties are its box and its pages.
 */
export function SlotEditor({ selection, widget }: { selection: WidgetSelection; widget: SlotWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: SlotWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as SlotWidgetConfiguration))
  const pages = pagesOf(widget)
  return (
    <>
      <ContainerEditor
        widget={widget}
        update={update}
        count={pages.reduce((total, page) => total + widgetsOf(page).length, 0)}
        summary="The slot draws nothing itself — put a shape behind it for a background. Every page is this box, and its widgets are placed relative to it."
      />
      {widget.id ? <SlotPagesEditor slotId={widget.id} pages={pages} /> : null}
    </>
  )
}

export function TextEditor({ selection, widget }: { selection: WidgetSelection; widget: TextWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: TextWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as TextWidgetConfiguration))
  const sources = widget.sources ?? []
  return (
    <>
      <Group
        id="Data"
        title="Data"
        icon={GROUP_ICONS.data}
        hint={HINTS.text.sources}
        summary={sources.length > 1 ? `${sources.length} sources` : sources[0]?.binding || 'Unbound'}
      >
        {sources.map((source, index) => (
          <SourceEditor
            key={index}
            source={source}
            index={index}
            removable={sources.length > 1}
            onChange={(mutation) => update((next) => {
              const list = next.sources ?? []
              if (list[index]) mutation(list[index])
            })}
            onRemove={() => update((next) => {
              next.sources = (next.sources ?? []).filter((_, position) => position !== index)
            })}
          />
        ))}
        {sources.length < MAXIMUM_TEXT_SOURCES ? (
          <AddButton label="Add source" onClick={() => update((next) => {
            next.sources = [...(next.sources ?? []), {}]
          })} />
        ) : null}
      </Group>
      <Group id="Value" title="Value" icon={GROUP_ICONS.value}>
        <FontEditor font={widget.value?.font} defaultSizePx={DEFAULT_WIDGET_FONT_SIZE_PX} onChange={(font) => update((next) => { next.value = { ...next.value, font } })} />
        <ColorField label="Color" value={widget.value?.color ?? '#E8E8E8'} modified={authored(widget.value?.color, '#E8E8E8')} onReset={() => update((next) => { if (next.value) delete next.value.color })} onChange={(value) => update((next) => { next.value = { ...next.value, color: value } })} />
        <SelectField label="Alignment" hint={HINTS.text.alignment} value={widget.value?.alignment ?? 'center'} options={TEXT_ALIGNMENT_VALUES} modified={authored(widget.value?.alignment, 'center')} onReset={() => update((next) => { if (next.value) delete next.value.alignment })} onChange={(value) => update((next) => { next.value = { ...next.value, alignment: value } })} />
        <TextField label="Fallback" hint={HINTS.text.fallback} value={widget.value?.unavailable_text ?? ''} modified={authored(widget.value?.unavailable_text, '')} onReset={() => update((next) => { if (next.value) delete next.value.unavailable_text })} onChange={(value) => update((next) => { next.value = { ...next.value, unavailable_text: value } })} />
      </Group>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}
