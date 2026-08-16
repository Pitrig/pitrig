import { useEffect, useId, useRef, useState } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDeviceStore } from '@/features/device/device-store'
import { widgetsOf } from '../../../../shared/configuration-access'
import {
  MAXIMUM_TEXT_SOURCES,
  type DeltaTimeWidgetConfiguration,
  type FontSpec,
  type RgbColor,
  type TextSourceConfiguration,
  type TextWidgetConfiguration,
  type ValueTransform,
  type WidgetPlacement
} from '../../../../shared/configuration-schema'
import type { DeviceConfiguration } from '../../../../shared/device'
import {
  TELEMETRY_CATALOG,
  type TelemetryCatalogEntry
} from '../../../../shared/telemetry-catalog'
import {
  MAXIMUM_TRANSFORM_DECIMALS,
  unitPresetsFor
} from '../../../../shared/value-transform'
import {
  activeScreen,
  completePlacement,
  mutateActiveScreen,
  mutateSelectedWidget,
  selectedWidget,
  useDashboardEditorStore,
  type WidgetSelection
} from './dashboard-editor'

export function WidgetInspector(): React.JSX.Element {
  const configuration = useDeviceStore((state) => state.draft)
  const selection = useDashboardEditorStore((state) => state.selection)
  const select = useDashboardEditorStore((state) => state.select)
  const widget = selectedWidget(configuration, selection)
  const widgets = widgetsOf(activeScreen(configuration))

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
            {widgets.map((item, index) => (
              <option key={item.id ?? index} value={`widget:${item.id ?? ''}`}>
                {item.type === 'delta_time'
                  ? 'Delta time'
                  : `Text ${index + 1}: ${item.title?.text || item.sources?.[0]?.binding || 'Untitled'}`}
              </option>
            ))}
          </select>
        </label>

        {!configuration ? <Hint>Fix the JSON draft before using the visual editor.</Hint> : null}
        {configuration && selection?.type === 'screen' ? (
          <ScreenEditor configuration={configuration} />
        ) : null}
        {configuration && selection?.type === 'widget' && !widget ? <Hint>Select an existing widget on the display.</Hint> : null}
        {configuration && widget && selection?.type === 'widget' ? (
          <>
            <GeometryEditor selection={selection} placement={completePlacement(widget.placement)} zIndex={widget.z_index ?? 0} />
            {widget.type === 'delta_time' ? (
              <DeltaTimeEditor selection={selection} widget={widget} configuration={configuration} />
            ) : (
              <TextEditor selection={selection} widget={widget} />
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
        value={activeScreen(configuration)?.background_color ?? '#000000'}
        onChange={(background_color) =>
          mutateActiveScreen((screen) => {
            screen.background_color = background_color
          })
        }
      />
    </Section>
  )
}

function GeometryEditor({ selection, placement, zIndex }: { selection: WidgetSelection; placement?: Required<WidgetPlacement>; zIndex: number }): React.JSX.Element {
  const update = (key: keyof Required<WidgetPlacement>, value: number): void => mutateSelectedWidget(selection, (widget) => {
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
        <OptionalColorField label="Background" value={widget.background_color} onChange={(value) => update((next) => { if (value) next.background_color = value; else delete next.background_color })} />
        <div className="grid grid-cols-2 gap-2">{(['left', 'top', 'right', 'bottom'] as const).map((key) => <NumberField key={key} label={`Padding ${key}`} value={widget.padding?.[key] ?? 0} min={0} onChange={(value) => update((next) => { next.padding = { ...next.padding, [key]: value } })} />)}</div>
        <div className="grid grid-cols-2 gap-2"><NumberField label="Border width" value={widget.border?.width_px ?? 0} min={0} onChange={(value) => update((next) => { next.border = { ...next.border, width_px: value } })} /><NumberField label="Radius" value={widget.border?.radius_px ?? 0} min={0} onChange={(value) => update((next) => { next.border = { ...next.border, radius_px: value } })} /></div>
        <ColorField label="Border color" value={widget.border?.color ?? '#AEAEAE'} onChange={(value) => update((next) => { next.border = { ...next.border, color: value } })} />
      </Section>
    </>
  )
}

function SourceEditor({ source, index, removable, onChange, onRemove }: {
  source: TextSourceConfiguration
  index: number
  removable: boolean
  onChange: (mutation: (next: TextSourceConfiguration) => void) => void
  onRemove: () => void
}): React.JSX.Element {
  const binding = TELEMETRY_CATALOG.find(({ name }) => name === source.binding)
  const transforms = transformOptions(binding)
  const presets = unitPresetsFor(binding)
  const affix = (key: 'prefix' | 'suffix') => (value: string): void => onChange((next) => {
    const transform = next.transform ?? {}
    transform[key] = value
    next.transform = transform
    pruneTransform(next)
  })
  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">Source {index + 1}</span>
        {removable ? (
          <button type="button" className="rounded-md border px-2 py-0.5 text-foreground" onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </div>
      <TelemetryBindingField value={source.binding ?? ''} onChange={(value) => onChange((next) => {
        next.binding = value
        const selected = TELEMETRY_CATALOG.find(({ name }) => name === value)
        // An unrecognized name is left alone: the binding is mid-edit, not wrong.
        if (selected && next.transform && !transformOptions(selected).includes(transformSelection(next.transform))) {
          clearTransformType(next.transform)
          pruneTransform(next)
        }
      })} />
      <SelectField label="Modifier" value={source.modifiers?.some(({ type }) => type === 'lap_timer') ? 'lap_timer' : 'none'} options={['none', 'lap_timer']} onChange={(value) => onChange((next) => {
        if (value === 'lap_timer') { next.binding = 'session.lap.current_time'; next.modifiers = [{ type: 'lap_timer' }] }
        else delete next.modifiers
      })} />
      <SelectField label="Transform" value={transformSelection(source.transform)} options={transforms} onChange={(value) => onChange((next) => {
        const transform = next.transform ?? {}
        clearTransformType(transform)
        if (value === 'number') transform.type = 'number'
        else if (value !== 'source_text') { transform.type = 'time'; transform.format = value as 'duration_ms' | 'signed_duration_ms' }
        next.transform = transform
        pruneTransform(next)
      })} />
      {source.transform?.type === 'number' ? (
        <>
          {presets.length > 0 ? <SelectField label="Unit preset" value={presets.find(({ scale, offset }) => scale === source.transform?.scale && offset === (source.transform?.offset ?? 0))?.label ?? ''} options={presets.map(({ label }) => label)} onChange={(label) => onChange((next) => {
            const preset = presets.find((entry) => entry.label === label)
            if (!preset || !next.transform) return
            next.transform.scale = preset.scale
            next.transform.offset = preset.offset
            next.transform.suffix = preset.suffix
          })} /> : null}
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Decimals" value={source.transform.decimals ?? 0} min={0} max={MAXIMUM_TRANSFORM_DECIMALS} onChange={(value) => onChange((next) => { if (next.transform) next.transform.decimals = Math.min(MAXIMUM_TRANSFORM_DECIMALS, Math.max(0, Math.round(value))) })} />
            <NumberField label="Scale" value={source.transform.scale ?? 1} step="any" onChange={(value) => onChange((next) => { if (next.transform) next.transform.scale = value })} />
            <NumberField label="Offset" value={source.transform.offset ?? 0} step="any" onChange={(value) => onChange((next) => { if (next.transform) next.transform.offset = value })} />
          </div>
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-2"><TextField label="Prefix" value={source.transform?.prefix ?? ''} onChange={affix('prefix')} /><TextField label="Suffix" value={source.transform?.suffix ?? ''} onChange={affix('suffix')} /></div>
    </div>
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
        <span className="block text-[11px] leading-4 text-amber-400">Unknown telemetry binding</span>
      ) : null}
    </label>
  )
}

// The device rejects a transform it cannot read, so the editor offers only the
// ones the selected binding supports: any non-boolean value can be formatted as
// a number, while each duration format accepts one millisecond type.
function transformOptions(binding: TelemetryCatalogEntry | undefined): readonly string[] {
  if (!binding) return ['source_text']
  const options = ['source_text']
  if (binding.type !== 'boolean') options.push('number')
  if (binding.unit === 'millisecond' && binding.type === 'uint32') options.push('duration_ms')
  if (binding.unit === 'millisecond' && binding.type === 'int32') options.push('signed_duration_ms')
  return options
}

/** The Transform select value: a transform may exist carrying affixes alone. */
function transformSelection(transform: ValueTransform | undefined): string {
  if (transform?.type === 'number') return 'number'
  if (transform?.type === 'time') return transform.format ?? 'duration_ms'
  return 'source_text'
}

function clearTransformType(transform: ValueTransform): void {
  transform.type = 'none'
  delete transform.format
  delete transform.decimals
  delete transform.scale
  delete transform.offset
}

/** Keeps the document sparse: a transform that formats nothing is not written. */
function pruneTransform(source: TextSourceConfiguration): void {
  const transform = source.transform
  if (transform && (transform.type ?? 'none') === 'none' && !transform.prefix && !transform.suffix) {
    delete source.transform
  }
}

function DeltaTimeEditor({ selection, widget, configuration }: { selection: WidgetSelection; widget: DeltaTimeWidgetConfiguration; configuration: DeviceConfiguration }): React.JSX.Element {
  const update = (mutation: (next: DeltaTimeWidgetConfiguration, config: DeviceConfiguration) => void): void => mutateSelectedWidget(selection, (next, config) => mutation(next as DeltaTimeWidgetConfiguration, config))
  const module = configuration.delta_time
  return <>
    <Section title="Value"><FontEditor font={widget.font} onChange={(font) => update((next) => { next.font = font })} /><ColorField label="Faster" value={widget.faster_color ?? '#00C853'} onChange={(value) => update((next) => { next.faster_color = value })} /><ColorField label="Slower" value={widget.slower_color ?? '#D50000'} onChange={(value) => update((next) => { next.slower_color = value })} /><ColorField label="Neutral" value={widget.neutral_color ?? '#E8E8E8'} onChange={(value) => update((next) => { next.neutral_color = value })} /></Section>
    <Section title="Behavior"><SelectField label="Unavailable" value={module?.unavailable_behavior ?? 'hide'} options={['hide', 'placeholder', 'zero']} onChange={(value) => update((_next, config) => { config.delta_time = { ...config.delta_time, unavailable_behavior: value as 'hide' | 'placeholder' | 'zero' } })} />{module?.unavailable_behavior === 'placeholder' ? <TextField label="Placeholder" value={module.placeholder ?? '---'} onChange={(value) => update((_next, config) => { config.delta_time = { ...config.delta_time, placeholder: value } })} /> : null}</Section>
    <Section title="Scale"><CheckboxField label="Enabled" checked={module?.scale?.enabled ?? false} onChange={(checked) => update((_next, config) => { config.delta_time = { ...config.delta_time, scale: { ...config.delta_time?.scale, enabled: checked } } })} /><CheckboxField label="Show sign" checked={module?.scale?.show_sign ?? false} onChange={(checked) => update((_next, config) => { config.delta_time = { ...config.delta_time, scale: { ...config.delta_time?.scale, show_sign: checked } } })} /><NumberField label="Range (ms)" value={module?.scale?.range_ms ?? 2000} min={1} onChange={(value) => update((_next, config) => { config.delta_time = { ...config.delta_time, scale: { ...config.delta_time?.scale, range_ms: value } } })} /><div className="grid grid-cols-2 gap-2"><NumberField label="Vertical padding" value={widget.scale?.vertical_padding_px ?? 2} min={0} onChange={(value) => update((next) => { next.scale = { ...next.scale, vertical_padding_px: value } })} /><NumberField label="Border width" value={widget.scale?.border_width_px ?? 2} min={0} onChange={(value) => update((next) => { next.scale = { ...next.scale, border_width_px: value } })} /><NumberField label="Radius" value={widget.scale?.border_radius_px ?? 8} min={0} onChange={(value) => update((next) => { next.scale = { ...next.scale, border_radius_px: value } })} /></div></Section>
  </>
}

function FontEditor({ font, onChange }: { font?: FontSpec; onChange: (font: FontSpec) => void }): React.JSX.Element { return <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2"><TextField label="Font family" value={font?.family ?? ''} onChange={(family) => onChange({ ...font, family })} /><NumberField label="Size" value={font?.size_px ?? 16} min={1} max={255} onChange={(size_px) => onChange({ ...font, size_px })} /></div> }
function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element { return <section className="space-y-2 border-t pt-3"><h3 className="font-medium">{title}</h3>{children}</section> }
function Hint({ children }: { children: React.ReactNode }): React.JSX.Element { return <p className="rounded-md border p-2 text-muted-foreground">{children}</p> }
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): React.JSX.Element {
  const [local, change, flush] = useDebouncedCommit(value, onChange)
  return <label className="block space-y-1 text-muted-foreground"><span>{label}</span><input className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={local} onChange={(event) => change(event.target.value)} onBlur={flush} /></label>
}
function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min?: number; max?: number; step?: number | 'any'; onChange: (value: number) => void }): React.JSX.Element {
  const [local, change, flush] = useDebouncedCommit(value, onChange)
  return <label className="block space-y-1 text-muted-foreground"><span>{label}</span><input type="number" className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={local} min={min} max={max} step={step} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) change(next) }} onBlur={flush} /></label>
}
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }): React.JSX.Element { return <label className="block space-y-1 text-muted-foreground"><span>{label}</span><select className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={value} onChange={(event) => onChange(event.target.value)}>{value === '' ? <option value="">Not set</option> : null}{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label> }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: RgbColor) => void }): React.JSX.Element {
  const [local, change, flush] = useDebouncedCommit(value, (next) => onChange(next as RgbColor))
  const opaque = /^#[0-9A-Fa-f]{6}$/.test(local)
  return <label className="flex items-end gap-2 text-muted-foreground"><span className="min-w-0 flex-1 space-y-1"><span className="block">{label}</span><input className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={local} onChange={(event) => change(event.target.value)} onBlur={flush} /></span><input aria-label={`${label} picker`} type="color" className="h-8 w-10 rounded border bg-background p-1" value={opaque ? local : '#000000'} onChange={(event) => onChange(event.target.value as RgbColor)} /></label>
}
function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }): React.JSX.Element { return <label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label> }
function selectionValue(selection: WidgetSelection | undefined): string { return selection?.type === 'screen' ? 'screen' : selection?.type === 'widget' ? `widget:${selection.id}` : '' }
function parseSelection(value: string): WidgetSelection | undefined { if (value === 'screen') return { type: 'screen' }; if (value.startsWith('widget:')) return { type: 'widget', id: value.slice(7) }; return undefined }

function OptionalColorField({ label, value, onChange }: { label: string; value?: string; onChange: (value: RgbColor | undefined) => void }): React.JSX.Element {
  return (
    <div className="space-y-1">
      <CheckboxField label={`${label} enabled`} checked={value !== undefined} onChange={(checked) => onChange(checked ? '#000000' : undefined)} />
      {value !== undefined ? <ColorField label={label} value={value} onChange={onChange} /> : null}
    </div>
  )
}

/**
 * Keeps typing local and commits on a trailing delay or on blur. Without this
 * every keystroke rewrote the whole configuration document.
 */
function useDebouncedCommit<T>(value: T, commit: (value: T) => void, delay = 200): [T, (next: T) => void, () => void] {
  const [local, setLocal] = useState(value)
  const editing = useRef(false)
  const latest = useRef(commit)

  useEffect(() => {
    latest.current = commit
  })

  useEffect(() => {
    if (!editing.current) setLocal(value)
  }, [value])

  useEffect(() => {
    if (!editing.current) return
    const timer = setTimeout(() => {
      editing.current = false
      latest.current(local)
    }, delay)
    return () => clearTimeout(timer)
  }, [local, delay])

  const change = (next: T): void => {
    editing.current = true
    setLocal(next)
  }
  const flush = (): void => {
    if (!editing.current) return
    editing.current = false
    latest.current(local)
  }
  return [local, change, flush]
}
