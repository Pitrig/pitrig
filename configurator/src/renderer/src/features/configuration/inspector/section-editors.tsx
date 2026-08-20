import { screensOf } from '@shared/configuration-access'
import { type ValueSourceConfiguration, type WidgetPlacement } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { documentFonts } from '@shared/document-fonts'
import { MAXIMUM_FONT_FAMILIES } from '@shared/font-assets'
import { type WidgetSelection, applyFontFamilyToDashboard, draftFontFamily, mutateActiveScreen, mutateSelectedWidget, renameScreen, useDashboardEditorStore } from '../dashboard-editor'
import { TelemetryBindingField } from './TelemetryBindingField'
import { CheckboxField, ColorField, FontFamilyField, IdField, NumberField, Section, SelectField } from './fields'
import { Button } from '@/components/ui/button'
import { dashboardFontFootprint, findFontEntry, kilobytes, useFontLibraryStore } from '@/features/font-library/font-library-store'

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


/**
 * What holding widgets means. The clip is the one property here rather than in
 * the styling sections, because it is not an appearance: it says where this
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
    <Section title="Container">
      <p className="text-muted-foreground">{summary}</p>
      <CheckboxField
        label="Clip contents to this box"
        checked={clips}
        onChange={(checked) => update((next) => {
          // Written only when it differs from the default, so the document stays
          // as sparse as the author left it.
          if (checked) delete next.clip_children
          else next.clip_children = false
        })}
      />
      {count > 0 && !clips ? (
        <p className="text-muted-foreground">
          Widgets inside are drawn where they land, including past this box — which
          is what a caption straddling a child&apos;s top border needs.
        </p>
      ) : null}
    </Section>
  )
}

interface ClippingWidget {
  clip_children?: boolean
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
    <Section title="Dashboard">
      {/* Family only. A size belongs to the widget that draws the text — a
          caption and a reading are deliberately different sizes, so there is no
          dashboard-wide one to set. */}
      <FontFamilyField family={family} onChange={setDefaultFontFamily} />
      <p className="text-muted-foreground">New widgets take this font.</p>
      <Button
        variant="outline"
        className="w-full"
        disabled={used.length === 0}
        onClick={() => applyFontFamilyToDashboard(family)}
      >
        Apply to every widget
      </Button>
      <div className="space-y-1 rounded-md border p-2 text-muted-foreground">
        <p>
          {footprint.families} of {MAXIMUM_FONT_FAMILIES} families ·{' '}
          {kilobytes(footprint.bytes)} of 2 MiB
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
    </Section>
  )
}
