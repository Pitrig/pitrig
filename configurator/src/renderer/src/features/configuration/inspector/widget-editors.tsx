import { pagesOf } from '@shared/configuration-access'
import { type ArcWidgetConfiguration, BAR_ORIENTATION_VALUES, type BarOrientation, type BarWidgetConfiguration, type GraphWidgetConfiguration, type ImageWidgetConfiguration, type IndicatorWidgetConfiguration, MAXIMUM_GRAPH_POINTS, MAXIMUM_INDICATOR_SEGMENTS, MAXIMUM_TEXT_SOURCES, SHAPE_KIND_VALUES, type ShapeKind, type ShapeWidgetConfiguration, type SlotWidgetConfiguration, TEXT_ALIGNMENT_VALUES, type TextAlignment, type TextWidgetConfiguration } from '@shared/configuration-schema'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { MAXIMUM_BLINK_MS } from '@shared/widget-conditions'
import { type WidgetSelection, mutateSelectedWidget } from '../dashboard-editor'
import { SourceEditor, TelemetryBindingField } from './TelemetryBindingField'
import { CheckboxField, ColorField, FontEditor, Hint, NumberField, OptionalColorField, Section, SelectField, TextField } from './fields'
import { ContainerEditor, SlotPagesEditor, SourceRangeSection } from './section-editors'
import { BoxEditor, ConditionsEditor, TitleEditor } from './styling-editors'
import { useDeviceStore } from '@/features/device/device-store'

export function ArcEditor({ selection, widget }: { selection: WidgetSelection; widget: ArcWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: ArcWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as ArcWidgetConfiguration))
  return (
    <>
      <SourceRangeSection widget={widget} update={update} />
      <Section title="Arc">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Start angle (deg)" value={widget.start_angle_deg ?? 135} min={0} max={359} onChange={(value) => update((next) => { next.start_angle_deg = value })} />
          <NumberField label="Sweep (deg)" value={widget.sweep_deg ?? 270} min={1} max={360} onChange={(value) => update((next) => { next.sweep_deg = value })} />
        </div>
        <p className="text-muted-foreground">Zero degrees is three o&apos;clock and the angle grows clockwise, so 135 with a 270 sweep is the usual car gauge.</p>
        <NumberField label="Thickness (px)" value={widget.thickness_px ?? 8} min={1} onChange={(value) => update((next) => { next.thickness_px = value })} />
        <ColorField label="Fill color" value={widget.fill_color ?? '#38BDF8'} onChange={(value) => update((next) => { next.fill_color = value })} />
        <OptionalColorField label="Track color" value={widget.track_color} onChange={(value) => update((next) => { if (value === undefined) delete next.track_color; else next.track_color = value })} />
        <CheckboxField label="Sweep from the far end" checked={widget.inverted ?? false} onChange={(checked) => update((next) => { if (checked) next.inverted = true; else delete next.inverted })} />
      </Section>
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
      <Section title="Strip">
        <SelectField label="Orientation" value={widget.orientation ?? 'horizontal'} options={BAR_ORIENTATION_VALUES} onChange={(value) => update((next) => { next.orientation = value as BarOrientation })} />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Gap (px)" value={widget.segment_gap_px ?? 4} min={0} onChange={(value) => update((next) => { next.segment_gap_px = value })} />
          <NumberField label="Radius (px)" value={widget.segment_radius_px ?? 0} min={0} onChange={(value) => update((next) => { next.segment_radius_px = value })} />
        </div>
        <OptionalColorField label="Unlit color" value={widget.off_color} onChange={(value) => update((next) => { if (value === undefined) delete next.off_color; else next.off_color = value })} />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Blink from" value={widget.blink_threshold ?? 2} step="any" onChange={(value) => update((next) => { next.blink_threshold = value })} />
          <NumberField label="Blink (ms)" value={widget.blink_ms ?? 0} min={0} max={MAXIMUM_BLINK_MS} onChange={(value) => update((next) => { next.blink_ms = value })} />
        </div>
        <p className="text-muted-foreground">Blinking starts at this fraction of the range; above 1 it never blinks, and so does a zero period.</p>
      </Section>
      <Section title="Segments">
        <p className="text-muted-foreground">Each lamp lights at its fraction of the range, so one strip suits any engine. Thresholds must not decrease.</p>
        {segments.map((segment, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <NumberField label={`Lamp ${index + 1}`} value={segment.threshold ?? 0} step="any" min={0} max={1} onChange={(value) => update((next) => {
              const list = [...(next.segments ?? [])]
              list[index] = { ...list[index], threshold: value }
              next.segments = list
            })} />
            <ColorField label="Color" value={segment.color ?? '#00C853'} onChange={(value) => update((next) => {
              const list = [...(next.segments ?? [])]
              list[index] = { ...list[index], color: value }
              next.segments = list
            })} />
            <button className="h-8 rounded-md border px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => update((next) => {
              next.segments = (next.segments ?? []).filter((_, position) => position !== index)
            })}>Remove</button>
          </div>
        ))}
        {segments.length < MAXIMUM_INDICATOR_SEGMENTS ? (
          <button className="h-8 rounded-md border px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => update((next) => {
            const list = next.segments ?? []
            const previous = list[list.length - 1]
            next.segments = [...list, { threshold: previous?.threshold ?? 0, color: previous?.color ?? '#00C853' }]
          })}>Add lamp</button>
        ) : <Hint>{`A strip holds at most ${MAXIMUM_INDICATOR_SEGMENTS} lamps.`}</Hint>}
      </Section>
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
  return (
    <>
      <Section title="Image">
        <SelectField label="Uploaded image" value={widget.image ?? ''} options={['', ...installed.map(({ name }) => name)]} onChange={(value) => update((next) => { if (value) next.image = value; else delete next.image })} />
        {installed.length === 0 ? <Hint>Upload images to the board to choose one here.</Hint> : null}
        {widget.image && !known && installed.length > 0 ? <Hint>{`"${widget.image}" is not installed on the connected board, so the device will refuse this configuration.`}</Hint> : null}
        {known ? <p className="text-muted-foreground">{`${known.width} × ${known.height} · ${known.format}. The device draws it at the size it was uploaded at, so match the widget to it.`}</p> : null}
        <OptionalColorField label="Recolor" value={widget.recolor} onChange={(value) => update((next) => { if (value) next.recolor = value; else { delete next.recolor; delete next.recolor_opa } })} />
        {widget.recolor ? <NumberField label="Recolor strength (0-255)" value={widget.recolor_opa ?? 255} min={0} max={255} onChange={(value) => update((next) => { next.recolor_opa = Math.min(255, Math.max(0, Math.round(value))) })} /> : null}
      </Section>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

export function GraphEditor({ selection, widget }: { selection: WidgetSelection; widget: GraphWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: GraphWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as GraphWidgetConfiguration))
  const points = widget.point_count ?? 64
  const interval = widget.sample_interval_ms ?? 100
  return (
    <>
      <SourceRangeSection widget={widget} update={update} />
      <Section title="Trace">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Points" value={points} min={2} max={MAXIMUM_GRAPH_POINTS} onChange={(value) => update((next) => { next.point_count = value })} />
          <NumberField label="Interval (ms)" value={interval} min={1} onChange={(value) => update((next) => { next.sample_interval_ms = value })} />
        </div>
        <p className="text-muted-foreground">{`Shows the last ${((points * interval) / 1000).toFixed(1)} s. The trace is the most expensive widget to draw, so keep the point count only as high as it needs to be.`}</p>
        <ColorField label="Line color" value={widget.line_color ?? '#38BDF8'} onChange={(value) => update((next) => { next.line_color = value })} />
        <NumberField label="Line width (px)" value={widget.line_width_px ?? 2} min={1} onChange={(value) => update((next) => { next.line_width_px = value })} />
      </Section>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

export function BarEditor({ selection, widget }: { selection: WidgetSelection; widget: BarWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: BarWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as BarWidgetConfiguration))
  const binding = TELEMETRY_CATALOG.find(({ name }) => name === widget.source?.binding)
  const unit = binding?.unit && binding.unit !== 'source' ? ` (${binding.unit})` : ''
  return (
    <>
      <Section title="Data">
        <TelemetryBindingField value={widget.source?.binding ?? ''} onChange={(value) => update((next) => {
          next.source = { ...next.source, binding: value }
        })} />
        <SelectField label="Modifier" value={widget.source?.modifiers?.some(({ type }) => type === 'lap_timer') ? 'lap_timer' : 'none'} options={['none', 'lap_timer']} onChange={(value) => update((next) => {
          if (value === 'lap_timer') next.source = { binding: 'session.lap.current_time', modifiers: [{ type: 'lap_timer' }] }
          else if (next.source) delete next.source.modifiers
        })} />
        <p className="text-muted-foreground">The fill is the value's place in this window, clamped at both ends.</p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={`Minimum${unit}`} value={widget.minimum ?? 0} step="any" onChange={(value) => update((next) => { next.minimum = value })} />
          <NumberField label={`Maximum${unit}`} value={widget.maximum ?? 1} step="any" onChange={(value) => update((next) => { next.maximum = value })} />
        </div>
        <CheckboxField label="Fill from a value" checked={widget.origin !== undefined} onChange={(checked) => update((next) => { if (checked) next.origin = 0; else delete next.origin })} />
        {widget.origin !== undefined ? (
          <>
            <NumberField label={`Origin${unit}`} value={widget.origin} step="any" onChange={(value) => update((next) => { next.origin = value })} />
            <p className="text-muted-foreground">The fill runs between this value and the current one, so a signed window with a zero origin reads as a centred meter.</p>
          </>
        ) : null}
      </Section>
      <Section title="Bar">
        <SelectField label="Orientation" value={widget.orientation ?? 'horizontal'} options={BAR_ORIENTATION_VALUES} onChange={(value) => update((next) => { next.orientation = value as BarOrientation })} />
        <CheckboxField label="Fill from the far end" checked={widget.inverted ?? false} onChange={(checked) => update((next) => { if (checked) next.inverted = true; else delete next.inverted })} />
        <ColorField label="Fill color" value={widget.fill_color ?? '#38BDF8'} onChange={(value) => update((next) => { next.fill_color = value })} />
        {/* The fill's gradient runs along the bar's own axis, so it needs no
            direction of its own. */}
        <OptionalColorField
          label="Fill gradient to"
          value={widget.fill_grad_color}
          onChange={(value) =>
            update((next) => {
              if (value) next.fill_grad_color = value
              else delete next.fill_grad_color
            })
          }
        />
        <p className="text-muted-foreground">The box background below is the track the fill runs over.</p>
      </Section>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

// A shape is its frame, so its own section is one property; the box and the
// styling rules come from the shared frame editors below.
export function ShapeEditor({ selection, widget }: { selection: WidgetSelection; widget: ShapeWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: ShapeWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as ShapeWidgetConfiguration))
  return (
    <>
      <Section title="Shape">
        <SelectField label="Kind" value={widget.kind ?? 'rectangle'} options={SHAPE_KIND_VALUES} onChange={(value) => update((next) => { next.kind = value as ShapeKind })} />
        <p className="text-muted-foreground">A line is a thin rectangle: give it a small height or width.</p>
      </Section>
      {/* A shape holds widgets, so it gets the section that says what holding
          them means. */}
      <ContainerEditor widget={widget} />
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

/**
 * A slot is an area that switches what it shows. It draws nothing, so it has no
 * frame editors at all — the device refuses a slot with an appearance — and its
 * only properties are its box and its pages.
 */
export function SlotEditor({ widget }: { widget: SlotWidgetConfiguration }): React.JSX.Element {
  const pages = pagesOf(widget)
  return (
    <>
      <Section title="Slot">
        <p className="text-muted-foreground">
          {`Switches between ${pages.length} page(s) in this box. A tap on the board cycles the pages in the loop; a page with a trigger is raised over them while its event lasts. The slot itself draws nothing — put a shape behind it for a background.`}
        </p>
      </Section>
      {widget.id ? <SlotPagesEditor slotId={widget.id} pages={pages} /> : null}
    </>
  )
}

/**
 * What a tap does. Carried by every widget, so the editor for it is one
 * component: a readout that doubles as a button and a rectangle of the screen
 * are the same thing to the device.
 *
 * The board reaches this only where there is a digitizer, which the hint says
 * rather than the editor hiding the section on those boards — a document is
 * authored for the dashboard, not for the plate it is being edited on.
 */

export function TextEditor({ selection, widget }: { selection: WidgetSelection; widget: TextWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: TextWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as TextWidgetConfiguration))
  const sources = widget.sources ?? []
  return (
    <>
      <Section title="Data">
        <p className="text-muted-foreground">
          Sources render in order, each through its own transform. A prefix or suffix is what
          separates one from the next, so {'"P 3/24"'} is a position source followed by a
          participants source prefixed with {'"/"'}.
        </p>
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
          <button
            type="button"
            className="h-8 w-full rounded-md border text-foreground"
            onClick={() => update((next) => {
              next.sources = [...(next.sources ?? []), {}]
            })}
          >
            Add source
          </button>
        ) : null}
      </Section>
      <TitleEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
      <Section title="Value">
        <FontEditor font={widget.value?.font} onChange={(font) => update((next) => { next.value = { ...next.value, font } })} />
        <SelectField label="Alignment" value={widget.value?.alignment ?? 'center'} options={TEXT_ALIGNMENT_VALUES} onChange={(value) => update((next) => { next.value = { ...next.value, alignment: value as TextAlignment } })} />
        <TextField label="Unavailable text" value={widget.value?.unavailable_text ?? ''} onChange={(value) => update((next) => { next.value = { ...next.value, unavailable_text: value } })} />
        <ColorField label="Color" value={widget.value?.color ?? '#E8E8E8'} onChange={(value) => update((next) => { next.value = { ...next.value, color: value } })} />
      </Section>
      <BoxEditor widget={widget} update={update} />
    </>
  )
}
