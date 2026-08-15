import { useId, useMemo } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDeviceStore } from '@/features/device/device-store'
import type { DeviceConfiguration, FontSpec, Placement, RgbColor } from '../../../../shared/device'
import {
  TELEMETRY_CATALOG,
  type TelemetryCatalogEntry
} from '../../../../shared/telemetry-catalog'
import {
  completePlacement,
  mutateDraftConfiguration,
  mutateSelectedWidget,
  parseDraftConfiguration,
  selectedWidget,
  type DeltaTimeWidgetConfiguration,
  type TextWidgetConfiguration,
  useDashboardEditorStore,
  type WidgetSelection
} from './dashboard-editor'

export function WidgetInspector(): React.JSX.Element {
  const draftJson = useDeviceStore((state) => state.draftConfigurationJson)
  const selection = useDashboardEditorStore((state) => state.selection)
  const select = useDashboardEditorStore((state) => state.select)
  const configuration = useMemo(() => parseDraftConfiguration(draftJson), [draftJson])
  const widget = configuration ? selectedWidget(configuration, selection) : undefined
  const widgets = configuration?.dashboard?.widgets

  return (
    <Card>
      <CardHeader>
        <CardTitle>Widget inspector</CardTitle>
        <CardDescription>Select a widget on the display, then edit its properties.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <label className="block space-y-1 text-muted-foreground">
          <span>Selected widget</span>
          <select
            className="h-8 w-full rounded-md border bg-background px-2 text-foreground"
            value={selectionValue(selection)}
            onChange={(event) => select(parseSelection(event.target.value))}
          >
            <option value="">None</option>
            <option value="screen">Screen</option>
            {widgets?.delta_time ? <option value="delta_time">Delta time</option> : null}
            {(widgets?.text ?? []).map((item, index) => (
              <option key={index} value={`text:${index}`}>
                Text {index + 1}: {item.title?.text || item.binding || 'Untitled'}
              </option>
            ))}
          </select>
        </label>

        {!configuration ? <Hint>Fix the JSON draft before using the visual editor.</Hint> : null}
        {configuration && selection?.type === 'screen' ? (
          <ScreenEditor configuration={configuration} />
        ) : null}
        {configuration && selection?.type !== 'screen' && !widget ? <Hint>Select an existing widget on the display.</Hint> : null}
        {configuration && widget && selection && selection.type !== 'screen' ? (
          <>
            <GeometryEditor selection={selection} placement={completePlacement(widget.placement)} zIndex={widget.z_index ?? 0} />
            {selection.type === 'delta_time' ? (
              <DeltaTimeEditor
                selection={selection}
                widget={widget as DeltaTimeWidgetConfiguration}
                configuration={configuration}
              />
            ) : (
              <TextEditor selection={selection} widget={widget as TextWidgetConfiguration} />
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ScreenEditor({ configuration }: { configuration: DeviceConfiguration }): React.JSX.Element {
  return (
    <Section title="Screen">
      <ColorField
        label="Background color"
        value={configuration.dashboard?.background_color ?? '#000000'}
        onChange={(background_color) => mutateDraftConfiguration((next) => {
          next.dashboard = { ...next.dashboard, background_color }
        })}
      />
    </Section>
  )
}

function GeometryEditor({ selection, placement, zIndex }: { selection: WidgetSelection; placement?: Required<Placement>; zIndex: number }): React.JSX.Element {
  const update = (key: keyof Required<Placement>, value: number): void => mutateSelectedWidget(selection, (widget) => {
    widget.placement = { ...widget.placement, [key]: value }
  })
  return (
    <Section title="Geometry">
      <div className="grid grid-cols-2 gap-2">
        {(['x', 'y', 'width', 'height'] as const).map((key) => (
          <NumberField key={key} label={key.toUpperCase()} value={placement?.[key] ?? 0} min={key === 'width' || key === 'height' ? 1 : 0} onChange={(value) => update(key, value)} />
        ))}
      </div>
      <NumberField label="Z" value={zIndex} min={-32768} max={32767} onChange={(value) => mutateSelectedWidget(selection, (widget) => {
        widget.z_index = Math.min(32767, Math.max(-32768, value))
      })} />
    </Section>
  )
}

function TextEditor({ selection, widget }: { selection: WidgetSelection; widget: TextWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: TextWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as TextWidgetConfiguration))
  const binding = TELEMETRY_CATALOG.find(({ name }) => name === widget.binding)
  const transforms = transformOptions(binding)
  return (
    <>
      <Section title="Data">
        <TelemetryBindingField value={widget.binding ?? ''} onChange={(value) => update((next) => {
          next.binding = value
          const selected = TELEMETRY_CATALOG.find(({ name }) => name === value)
          if (next.transform && !transformOptions(selected).includes(next.transform.format)) delete next.transform
        })} />
        <SelectField label="Modifier" value={widget.modifiers?.some(({ type }) => type === 'lap_timer') ? 'lap_timer' : 'none'} options={['none', 'lap_timer']} onChange={(value) => update((next) => {
          if (value === 'lap_timer') { next.binding = 'session.lap.current_time'; next.modifiers = [{ type: 'lap_timer' }] }
          else delete next.modifiers
        })} />
        <SelectField label="Transform" value={widget.transform?.format ?? 'source_text'} options={transforms} onChange={(value) => update((next) => {
          if (value === 'source_text') delete next.transform
          else next.transform = { type: 'time', format: value as 'duration_ms' | 'signed_duration_ms' }
        })} />
        {widget.transform ? <div className="grid grid-cols-2 gap-2"><TextField label="Prefix" value={widget.transform.prefix ?? ''} onChange={(value) => update((next) => { if (next.transform) next.transform.prefix = value })} /><TextField label="Suffix" value={widget.transform.suffix ?? ''} onChange={(value) => update((next) => { if (next.transform) next.transform.suffix = value })} /></div> : null}
      </Section>
      <Section title="Value">
        <FontEditor font={widget.value?.font} onChange={(font) => update((next) => { next.value = { ...next.value, font } })} />
        <SelectField label="Alignment" value={widget.value?.alignment ?? 'center'} options={['left', 'center', 'right']} onChange={(value) => update((next) => { next.value = { ...next.value, alignment: value as 'left' | 'center' | 'right' } })} />
        <TextField label="Unavailable text" value={widget.value?.unavailable_text ?? ''} onChange={(value) => update((next) => { next.value = { ...next.value, unavailable_text: value } })} />
        <ColorField label="Color" value={widget.value?.color ?? '#E8E8E8'} onChange={(value) => update((next) => { next.value = { ...next.value, color: value } })} />
      </Section>
      <Section title="Title">
        <TextField label="Text" value={widget.title?.text ?? ''} onChange={(value) => update((next) => { next.title = { ...next.title, text: value } })} />
        {widget.title?.text ? <><FontEditor font={widget.title.font} onChange={(font) => update((next) => { next.title = { ...next.title, font } })} /><ColorField label="Color" value={widget.title.color ?? '#E8E8E8'} onChange={(value) => update((next) => { next.title = { ...next.title, color: value } })} /><NumberField label="Y offset" value={widget.title.offset_y_px ?? 0} onChange={(value) => update((next) => { next.title = { ...next.title, offset_y_px: value } })} /></> : null}
      </Section>
      <Section title="Box">
        <ColorField label="Background" value={widget.background_color ?? '#00000000'} onChange={(value) => update((next) => { next.background_color = value })} />
        <div className="grid grid-cols-2 gap-2">{(['left', 'top', 'right', 'bottom'] as const).map((key) => <NumberField key={key} label={`Padding ${key}`} value={widget.padding?.[key] ?? 0} min={0} onChange={(value) => update((next) => { next.padding = { ...next.padding, [key]: value } })} />)}</div>
        <div className="grid grid-cols-2 gap-2"><NumberField label="Border width" value={widget.border?.width_px ?? 0} min={0} onChange={(value) => update((next) => { next.border = { ...next.border, width_px: value } })} /><NumberField label="Radius" value={widget.border?.radius_px ?? 0} min={0} onChange={(value) => update((next) => { next.border = { ...next.border, radius_px: value } })} /></div>
        <ColorField label="Border color" value={widget.border?.color ?? '#AEAEAE'} onChange={(value) => update((next) => { next.border = { ...next.border, color: value } })} />
      </Section>
    </>
  )
}

function TelemetryBindingField({ value, onChange }: { value: string; onChange: (value: string) => void }): React.JSX.Element {
  const listId = useId()
  const selected = TELEMETRY_CATALOG.find(({ name }) => name === value)
  return (
    <label className="block space-y-1 text-muted-foreground">
      <span>Binding</span>
      <input
        type="search"
        list={listId}
        className="h-8 w-full rounded-md border bg-background px-2 text-foreground"
        placeholder="Search telemetry fields"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {TELEMETRY_CATALOG.map((entry) => (
          <option key={entry.name} value={entry.name} label={`${entry.categoryLabel} — ${entry.description}`} />
        ))}
      </datalist>
      {selected ? (
        <span className="block text-[11px] leading-4">
          {selected.categoryLabel} · {selected.type} · {selected.unit} · {selected.rate} · ID {selected.wireId}
        </span>
      ) : value ? (
        <span className="block text-[11px] leading-4 text-destructive">Unknown telemetry binding</span>
      ) : null}
    </label>
  )
}

function transformOptions(binding: TelemetryCatalogEntry | undefined): readonly string[] {
  if (binding?.unit !== 'millisecond') return ['source_text']
  if (binding.type === 'uint32') return ['source_text', 'duration_ms']
  if (binding.type === 'int32') return ['source_text', 'signed_duration_ms']
  return ['source_text']
}

function DeltaTimeEditor({ selection, widget, configuration }: { selection: WidgetSelection; widget: DeltaTimeWidgetConfiguration; configuration: DeviceConfiguration }): React.JSX.Element {
  const update = (mutation: (next: DeltaTimeWidgetConfiguration, config: DeviceConfiguration) => void): void => mutateSelectedWidget(selection, (next, config) => mutation(next as DeltaTimeWidgetConfiguration, config))
  const module = configuration.delta_time
  return <>
    <Section title="Value"><FontEditor font={widget.font} onChange={(font) => update((next) => { next.font = font })} /><ColorField label="Faster" value={widget.faster_color ?? '#00FF00'} onChange={(value) => update((next) => { next.faster_color = value })} /><ColorField label="Slower" value={widget.slower_color ?? '#FF0000'} onChange={(value) => update((next) => { next.slower_color = value })} /><ColorField label="Neutral" value={widget.neutral_color ?? '#E8E8E8'} onChange={(value) => update((next) => { next.neutral_color = value })} /></Section>
    <Section title="Behavior"><SelectField label="Unavailable" value={module?.unavailable_behavior ?? 'hide'} options={['hide', 'placeholder', 'zero']} onChange={(value) => update((_next, config) => { config.delta_time = { ...config.delta_time, unavailable_behavior: value as 'hide' | 'placeholder' | 'zero' } })} />{module?.unavailable_behavior === 'placeholder' ? <TextField label="Placeholder" value={module.placeholder ?? '---'} onChange={(value) => update((_next, config) => { config.delta_time = { ...config.delta_time, placeholder: value } })} /> : null}</Section>
    <Section title="Scale"><CheckboxField label="Enabled" checked={module?.scale?.enabled ?? false} onChange={(checked) => update((_next, config) => { config.delta_time = { ...config.delta_time, scale: { ...config.delta_time?.scale, enabled: checked } } })} /><CheckboxField label="Show sign" checked={module?.scale?.show_sign ?? false} onChange={(checked) => update((_next, config) => { config.delta_time = { ...config.delta_time, scale: { ...config.delta_time?.scale, show_sign: checked } } })} /><NumberField label="Range (ms)" value={module?.scale?.range_ms ?? 1000} min={1} onChange={(value) => update((_next, config) => { config.delta_time = { ...config.delta_time, scale: { ...config.delta_time?.scale, range_ms: value } } })} /><div className="grid grid-cols-2 gap-2"><NumberField label="Vertical padding" value={widget.scale?.vertical_padding_px ?? 2} min={0} onChange={(value) => update((next) => { next.scale = { ...next.scale, vertical_padding_px: value } })} /><NumberField label="Border width" value={widget.scale?.border_width_px ?? 2} min={0} onChange={(value) => update((next) => { next.scale = { ...next.scale, border_width_px: value } })} /><NumberField label="Radius" value={widget.scale?.border_radius_px ?? 8} min={0} onChange={(value) => update((next) => { next.scale = { ...next.scale, border_radius_px: value } })} /></div></Section>
  </>
}

function FontEditor({ font, onChange }: { font?: FontSpec; onChange: (font: FontSpec) => void }): React.JSX.Element { return <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2"><TextField label="Font family" value={font?.family ?? ''} onChange={(family) => onChange({ ...font, family })} /><NumberField label="Size" value={font?.size_px ?? 16} min={1} max={255} onChange={(size_px) => onChange({ ...font, size_px })} /></div> }
function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element { return <section className="space-y-2 border-t pt-3"><h3 className="font-medium">{title}</h3>{children}</section> }
function Hint({ children }: { children: React.ReactNode }): React.JSX.Element { return <p className="rounded-md border p-2 text-muted-foreground">{children}</p> }
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): React.JSX.Element { return <label className="block space-y-1 text-muted-foreground"><span>{label}</span><input className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={value} onChange={(event) => onChange(event.target.value)} /></label> }
function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }): React.JSX.Element { return <label className="block space-y-1 text-muted-foreground"><span>{label}</span><input type="number" className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={value} min={min} max={max} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next) }} /></label> }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }): React.JSX.Element { return <label className="block space-y-1 text-muted-foreground"><span>{label}</span><select className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={value} onChange={(event) => onChange(event.target.value)}>{value === '' ? <option value="">Not set</option> : null}{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label> }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: RgbColor) => void }): React.JSX.Element { const opaque = /^#[0-9A-Fa-f]{6}$/.test(value); return <label className="flex items-end gap-2 text-muted-foreground"><span className="min-w-0 flex-1 space-y-1"><span className="block">{label}</span><input className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={value} onChange={(event) => onChange(event.target.value as RgbColor)} /></span><input aria-label={`${label} picker`} type="color" className="h-8 w-10 rounded border bg-background p-1" value={opaque ? value : '#000000'} onChange={(event) => onChange(event.target.value as RgbColor)} /></label> }
function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }): React.JSX.Element { return <label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label> }
function selectionValue(selection: WidgetSelection | undefined): string { return selection?.type === 'screen' ? 'screen' : selection?.type === 'delta_time' ? 'delta_time' : selection?.type === 'text' ? `text:${selection.index}` : '' }
function parseSelection(value: string): WidgetSelection | undefined { if (value === 'screen') return { type: 'screen' }; if (value === 'delta_time') return { type: 'delta_time' }; if (value.startsWith('text:')) return { type: 'text', index: Number(value.slice(5)) }; return undefined }
