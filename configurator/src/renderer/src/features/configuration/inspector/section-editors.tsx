import { screensOf, widgetsOf } from '@shared/configuration-access'
import { type ShapeWidgetConfiguration, type ValueSourceConfiguration, type WidgetPlacement } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { type WidgetSelection, mutateActiveScreen, mutateSelectedWidget, renameScreen, useDashboardEditorStore } from '../dashboard-editor'
import { TelemetryBindingField } from './TelemetryBindingField'
import { ColorField, IdField, NumberField, Section, SelectField } from './fields'

interface RangedWidget {
  source?: ValueSourceConfiguration
  minimum?: number
  maximum?: number
}

export function SourceRangeSection<T extends RangedWidget>({ widget, update }: { widget: T; update: (mutation: (next: T) => void) => void }): React.JSX.Element {
  const binding = TELEMETRY_CATALOG.find(({ name }) => name === widget.source?.binding)
  const unit = binding?.unit && binding.unit !== 'source' ? ` (${binding.unit})` : ''
  return (
    <Section title="Data">
      <TelemetryBindingField value={widget.source?.binding ?? ''} onChange={(value) => update((next) => {
        next.source = { ...next.source, binding: value }
      })} />
      <SelectField label="Modifier" value={widget.source?.modifiers?.some(({ type }) => type === 'lap_timer') ? 'lap_timer' : 'none'} options={['none', 'lap_timer']} onChange={(value) => update((next) => {
        if (value === 'lap_timer') next.source = { binding: 'session.lap.current_time', modifiers: [{ type: 'lap_timer' }] }
        else if (next.source) delete next.source.modifiers
      })} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label={`Minimum${unit}`} value={widget.minimum ?? 0} step="any" onChange={(value) => update((next) => { next.minimum = value })} />
        <NumberField label={`Maximum${unit}`} value={widget.maximum ?? 1} step="any" onChange={(value) => update((next) => { next.maximum = value })} />
      </div>
    </Section>
  )
}


export function ContainerEditor({
  widget
}: {
  widget: ShapeWidgetConfiguration
}): React.JSX.Element {
  const children = widgetsOf(widget).length
  return (
    <Section title="Container">
      <p className="text-muted-foreground">
        {children === 0
          ? 'This shape holds no widgets. Select some and wrap them to make it a container; an empty one with an action is an invisible tap zone.'
          : `Holds ${children} widget(s), placed relative to this box. They are drawn even where they overhang it.`}
      </p>
    </Section>
  )
}

/**
 * The pages of a slot: which of them the tap cycles, and what telemetry raises
 * one over the others. The widgets on a page are authored in the canvas rather
 * than here — a page is an area of the screen, so it is edited by looking at it.
 */
export function ScreenEditor({ configuration }: { configuration: DeviceConfiguration }): React.JSX.Element {
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const screen = screensOf(configuration)[activeScreenIndex]
  return (
    <Section title={`Screen ${activeScreenIndex + 1}`}>
      {/* A screen's name is what a goto_screen action points at, so it is worth
          setting to something the dashboard means. Renaming repoints every
          action that named it. */}
      <IdField
        key={screen?.id ?? activeScreenIndex}
        label="Name"
        value={screen?.id ?? `screen${activeScreenIndex + 1}`}
        onCommit={(name) => renameScreen(activeScreenIndex, name)}
      />
      <ColorField
        label="Background color"
        value={screensOf(configuration)[activeScreenIndex]?.background_color ?? '#000000'}
        onChange={(background_color) =>
          mutateActiveScreen((screen) => {
            screen.background_color = background_color
          })
        }
      />
    </Section>
  )
}

export function GeometryEditor({ selection, placement, zIndex }: { selection: WidgetSelection; placement?: Required<WidgetPlacement>; zIndex: number }): React.JSX.Element {
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
