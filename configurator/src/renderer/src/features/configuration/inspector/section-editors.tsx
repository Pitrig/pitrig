import { type ValueSourceConfiguration, type WidgetConfiguration, type WidgetPlacement } from '@shared/configuration-schema'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { NEW_WIDGET_SIZE, type WidgetSelection, mutateSelectedWidget } from '../dashboard-editor'
import { TelemetryBindingField } from './TelemetryBindingField'
import { authored } from './authored'
import { Advanced, Group } from './Group'
import { HINTS } from './hints'
import { GROUP_ICONS } from './icons'
import { PropertyRow } from './PropertyRow'
import { CheckboxField, NumberField, NumberInput, SelectField } from './fields'

interface RangedWidget {
  source?: ValueSourceConfiguration
  minimum?: number
  maximum?: number
}

export function SourceRangeSection<T extends RangedWidget>({ widget, update, children }: { widget: T; update: (mutation: (next: T) => void) => void; children?: React.ReactNode }): React.JSX.Element {
  return (
    <Group id="Data" title="Data" icon={GROUP_ICONS.data} summary={widget.source?.binding || 'Unbound'}>
      <SourceRangeFields widget={widget} update={update} />
      {children}
    </Group>
  )
}

export function SourceRangeFields<T extends RangedWidget>({ widget, update }: { widget: T; update: (mutation: (next: T) => void) => void }): React.JSX.Element {
  const binding = TELEMETRY_CATALOG.find(({ name }) => name === widget.source?.binding)
  const unit = binding?.unit && binding.unit !== 'source' ? ` (${binding.unit})` : ''
  return (
    <>
      <TelemetryBindingField value={widget.source?.binding ?? ''} onReset={() => update((next) => { delete next.source })} onChange={(value) => update((next) => {
        next.source = { ...next.source, binding: value }
      })} />
      <SelectField label="Modifier" hint={HINTS.data.modifier} value={widget.source?.modifiers?.some(({ type }) => type === 'lap_timer') ? 'lap_timer' : 'none'} options={['none', 'lap_timer']} modified={widget.source?.modifiers !== undefined} onReset={() => update((next) => { if (next.source) delete next.source.modifiers })} onChange={(value) => update((next) => {
        if (value === 'lap_timer') next.source = { binding: 'session.lap.current_time', modifiers: [{ type: 'lap_timer' }] }
        else if (next.source) delete next.source.modifiers
      })} />
      <RangeRow widget={widget} update={update} unit={unit} />
    </>
  )
}

function RangeRow<T extends RangedWidget>({ widget, update, unit }: { widget: T; update: (mutation: (next: T) => void) => void; unit: string }): React.JSX.Element {
  return (
    <PropertyRow
      label="Range"
      hint={HINTS.data.range}
      modified={authored(widget.minimum, 0) || authored(widget.maximum, 1)}
      onReset={() => update((next) => {
        delete next.minimum
        delete next.maximum
      })}
    >
      <div className="grid grid-cols-2 gap-1">
        <NumberInput title={`Minimum${unit}`} value={widget.minimum ?? 0} step="any" onChange={(value) => update((next) => { next.minimum = value })} />
        <NumberInput title={`Maximum${unit}`} value={widget.maximum ?? 1} step="any" onChange={(value) => update((next) => { next.maximum = value })} />
      </div>
      <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground">
        <span className="truncate">{`Minimum${unit}`}</span>
        <span className="truncate">{`Maximum${unit}`}</span>
      </div>
    </PropertyRow>
  )
}

export function ContainerEditor<T extends ClippingWidget>({
  widget,
  update,
  count,
  summary
}: {
  widget: T
  update: (mutation: (next: T) => void) => void
  count: number
  summary: string
}): React.JSX.Element {
  const clips = widget.clip_children !== false
  return (
    <Group id="Container" title="Container" icon={GROUP_ICONS.container} summary={count === 0 ? 'Empty' : `${count} widget(s)`} defaultOpen={count > 0}>
      <p className="text-muted-foreground">{summary}</p>
      <CheckboxField
        label="Clip contents"
        hint={HINTS.container.clip}
        checked={clips}
        modified={authored(widget.clip_children, true)}
        onReset={() => update((next) => { delete next.clip_children })}
        onChange={(checked) => update((next) => {
          if (checked) delete next.clip_children
          else next.clip_children = false
        })}
      />
    </Group>
  )
}

interface ClippingWidget {
  clip_children?: boolean
}

export function GeometryEditor({ selection, type, placement, zIndex }: { selection: WidgetSelection; type: WidgetConfiguration['type']; placement?: Required<WidgetPlacement>; zIndex?: number }): React.JSX.Element {
  const update = (key: keyof Required<WidgetPlacement>, value: number): void => mutateSelectedWidget(selection, (widget) => {
    widget.placement = { ...widget.placement, [key]: value }
  })
  const created = NEW_WIDGET_SIZE[type]
  return (
    <Group
      id="Geometry"
      title="Geometry"
      icon={GROUP_ICONS.geometry}
      summary={placement ? `${placement.width} × ${placement.height}` : undefined}
    >
      <PropertyRow
        label="Position"
        hint={HINTS.geometry.position}
        modified={authored(placement?.x, 0) || authored(placement?.y, 0)}
        onReset={() => mutateSelectedWidget(selection, (widget) => {
          widget.placement = { ...widget.placement, x: 0, y: 0 }
        })}
      >
        <div className="grid grid-cols-2 gap-1">
          <NumberInput title="X" value={placement?.x ?? 0} min={0} onChange={(value) => update('x', value)} />
          <NumberInput title="Y" value={placement?.y ?? 0} min={0} onChange={(value) => update('y', value)} />
        </div>
        <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>X</span><span>Y</span></div>
      </PropertyRow>
      <PropertyRow
        label="Size"
        hint={HINTS.geometry.size}
        modified={authored(placement?.width, created.width) || authored(placement?.height, created.height)}
        onReset={() => mutateSelectedWidget(selection, (widget) => {
          widget.placement = { ...widget.placement, ...created }
        })}
      >
        <div className="grid grid-cols-2 gap-1">
          <NumberInput title="Width" value={placement?.width ?? 1} min={1} onChange={(value) => update('width', value)} />
          <NumberInput title="Height" value={placement?.height ?? 1} min={1} onChange={(value) => update('height', value)} />
        </div>
        <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>Width</span><span>Height</span></div>
      </PropertyRow>
      <Advanced id="Geometry" active={authored(zIndex, 0)}>
        <NumberField
          label="Z"
          hint={HINTS.geometry.z}
          value={zIndex ?? 0}
          min={-32768}
          max={32767}
          modified={authored(zIndex, 0)}
          onReset={() => mutateSelectedWidget(selection, (widget) => { delete widget.z_index })}
          onChange={(value) => mutateSelectedWidget(selection, (widget) => {
            widget.z_index = Math.min(32767, Math.max(-32768, value))
          })}
        />
      </Advanced>
    </Group>
  )
}
