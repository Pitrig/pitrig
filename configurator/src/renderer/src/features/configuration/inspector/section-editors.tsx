import { screensOf } from '@shared/configuration-access'
import { type ValueSourceConfiguration, type WidgetConfiguration, type WidgetPlacement } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { documentFonts } from '@shared/document-fonts'
import { MAXIMUM_FONT_FAMILIES } from '@shared/font-assets'
import { NEW_WIDGET_SIZE, type WidgetSelection, applyFontFamilyToDashboard, draftFontFamily, mutateActiveScreen, mutateSelectedWidget, renameScreen, useDashboardEditorStore } from '../dashboard-editor'
import { TelemetryBindingField } from './TelemetryBindingField'
import { authored } from './authored'
import { Advanced, Group } from './Group'
import { HINTS } from './hints'
import { InfoHint } from './InfoHint'
import { GROUP_ICONS } from './icons'
import { PropertyRow } from './PropertyRow'
import { CheckboxField, ColorField, FontFamilyField, IdField, NumberField, NumberInput, SelectField } from './fields'
import { Button } from '@/components/ui/button'
import { dashboardFontFootprint, findFontEntry, kilobytes, useFontLibraryStore } from '@/features/font-library/font-library-store'

interface RangedWidget {
  source?: ValueSourceConfiguration
  minimum?: number
  maximum?: number
}

// Every gauge reads one source through one window, so they share the group that
// binds it rather than each spelling it out.
export function SourceRangeSection<T extends RangedWidget>({ widget, update, children }: { widget: T; update: (mutation: (next: T) => void) => void; children?: React.ReactNode }): React.JSX.Element {
  return (
    <Group id="Data" title="Data" icon={GROUP_ICONS.data} summary={widget.source?.binding || 'Unbound'}>
      <SourceRangeFields widget={widget} update={update} />
      {children}
    </Group>
  )
}

/**
 * What binds one value: the field it reads, the modifier over it, and the
 * window it is read through. A gauge shows these once, inside its Data group; a
 * graph shows the same three again for every further trace it draws, which is
 * why they are a component of their own rather than the body of that group.
 */
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

/**
 * The window a value is read against. The two ends share a row because neither
 * means anything without the other, and the unit is the bound field's.
 */
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

/**
 * What holding widgets means. The clip is the one property here rather than in
 * the styling groups, because it is not an appearance: it says where this
 * container's contents end, and a slot answers it for every one of its pages at
 * once.
 */
export function ContainerEditor<T extends ClippingWidget>({
  widget,
  update,
  count,
  summary
}: {
  widget: T
  update: (mutation: (next: T) => void) => void
  /** How many widgets it holds, which is what decides whether the clip matters. */
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
          // Written only when it differs from the default, so the document stays
          // as sparse as the author left it.
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

export function ScreenEditor({ configuration }: { configuration: DeviceConfiguration }): React.JSX.Element {
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const screen = screensOf(configuration)[activeScreenIndex]
  return (
    <Group id="Screen" title={`Screen ${activeScreenIndex + 1}`} icon={GROUP_ICONS.screen}>
      {/* A screen's name is what a goto_screen action points at, so it is worth
          setting to something the dashboard means. Renaming repoints every
          action that named it. */}
      <IdField
        key={screen?.id ?? activeScreenIndex}
        label="Name"
        hint={HINTS.screen.name}
        value={screen?.id ?? `screen${activeScreenIndex + 1}`}
        onCommit={(name) => renameScreen(activeScreenIndex, name)}
      />
      <ColorField
        label="Background"
        hint={HINTS.screen.background}
        value={screen?.background_color ?? '#000000'}
        modified={authored(screen?.background_color, '#000000')}
        onReset={() => mutateActiveScreen((screen) => { delete screen.background_color })}
        onChange={(background_color) =>
          mutateActiveScreen((screen) => {
            screen.background_color = background_color
          })
        }
      />
    </Group>
  )
}

/**
 * Where the widget sits. Last in the panel because the canvas is where a box is
 * normally moved — this is for the pixel that the drag could not reach.
 */
export function GeometryEditor({ selection, type, placement, zIndex }: { selection: WidgetSelection; type: WidgetConfiguration['type']; placement?: Required<WidgetPlacement>; zIndex?: number }): React.JSX.Element {
  const update = (key: keyof Required<WidgetPlacement>, value: number): void => mutateSelectedWidget(selection, (widget) => {
    widget.placement = { ...widget.placement, [key]: value }
  })
  // Written rather than deleted, both of them: the editor reads a placement
  // missing a side — or sized zero — as no placement at all and stops drawing
  // the widget, so the schema's own zero default is not somewhere this can put
  // one back to. Position returns to the origin; size to the box a new widget
  // of this type is created at.
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

/**
 * The dashboard's own properties, shown when no widget is selected.
 *
 * The font here is the editor's, not the document's: the contract declares no
 * document-level font and the device resolves one per widget, so this seeds
 * what gets added next and "Apply to every widget" is what changes what is
 * already there. Keeping it one command keeps it one undo.
 *
 * The budget beside it is the real cost of the choices made so far — the board
 * holds eight faces in two megabytes, and this is where that stops being a
 * surprise the device delivers at save time.
 */
export function DashboardSection({
  configuration
}: {
  configuration: DeviceConfiguration
}): React.JSX.Element {
  const entries = useFontLibraryStore((state) => state.entries)
  const defaultFontFamily = useDashboardEditorStore((state) => state.defaultFontFamily)
  const setDefaultFontFamily = useDashboardEditorStore((state) => state.setDefaultFontFamily)
  const family = draftFontFamily(configuration, defaultFontFamily)
  const used = [
    ...new Set(
      documentFonts(configuration)
        .map((font) => font?.family)
        .filter((value): value is string => Boolean(value))
    )
  ].sort()
  const footprint = dashboardFontFootprint(entries, used)
  return (
    <Group id="Dashboard" title="Dashboard" icon={GROUP_ICONS.dashboard}>
      {/* Family only. A size belongs to the widget that draws the text — a
          caption and a reading are deliberately different sizes, so there is no
          dashboard-wide one to set. */}
      <FontFamilyField label="New widgets" family={family} onChange={setDefaultFontFamily} hint={HINTS.dashboard.font} />
      <Button
        variant="outline"
        className="w-full"
        disabled={used.length === 0}
        onClick={() => applyFontFamilyToDashboard(family)}
      >
        Apply to every widget
      </Button>
      <div className="space-y-1 rounded-md border p-2 text-muted-foreground">
        <p className="flex items-center gap-1">
          <span>
            {footprint.families} of {MAXIMUM_FONT_FAMILIES} families ·{' '}
            {kilobytes(footprint.bytes)} of 2 MiB
          </span>
          <InfoHint text={HINTS.dashboard.budget} label="Font budget" />
        </p>
        <ul className="space-y-0.5">
          {used.map((id) => {
            const entry = findFontEntry(entries, id)
            return (
              <li key={id} className={entry ? '' : 'text-amber-500'}>
                {entry ? entry.name : `${id} — not in the library`}
              </li>
            )
          })}
        </ul>
      </div>
    </Group>
  )
}
