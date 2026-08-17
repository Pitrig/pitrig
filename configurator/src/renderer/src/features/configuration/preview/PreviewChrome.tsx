import { screenWidgetsOf, screensOf } from '../../../../../shared/configuration-access'
import { type ShapeWidgetConfiguration } from '../../../../../shared/configuration-schema'
import { type DisplayDescriptor } from '../../../../../shared/device'
import { LAP_SECONDS } from '../../../../../shared/mock-telemetry'
import { type AlignmentEdge, MAXIMUM_SCREENS, MAXIMUM_ZOOM, MINIMUM_ZOOM, type PreviewValueMode, addScreen, addTapZone, alignWidgets, deleteScreen, distributeWidgets, wrapInShape, useDashboardEditorStore } from '../dashboard-editor'
import { clampPan, visibleInSlot } from './canvas-geometry'
import { useDeviceStore } from '@/features/device/device-store'

/**
 * Which screen is being authored. The device always starts at the first one and
 * the driver swipes between them, so this is an editor view rather than a
 * document property — there is nothing here to save.
 */
function ScreenTabs(): React.JSX.Element {
  const configuration = useDeviceStore((state) => state.draft)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const setActiveScreen = useDashboardEditorStore((state) => state.setActiveScreen)
  const screens = screensOf(configuration)
  const count = Math.max(screens.length, 1)
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <button
          key={screens[index]?.id ?? index}
          type="button"
          title={`Edit screen ${index + 1}`}
          aria-pressed={index === activeScreenIndex}
          className={`h-7 rounded-md border px-2 hover:bg-muted ${
            index === activeScreenIndex ? 'bg-muted font-medium' : ''
          }`}
          onClick={() => setActiveScreen(index)}
        >
          {index + 1}
        </button>
      ))}
      {count < MAXIMUM_SCREENS ? (
        <button
          type="button"
          title="Add a screen"
          className="h-7 rounded-md border px-2 hover:bg-muted"
          onClick={() => {
            const index = addScreen()
            if (index !== undefined) setActiveScreen(index)
          }}
        >
          +
        </button>
      ) : null}
      {activeScreenIndex > 0 ? (
        <button
          type="button"
          title="Delete this screen and everything on it"
          className="h-7 rounded-md border px-2 hover:bg-muted"
          onClick={() => deleteScreen(activeScreenIndex)}
        >
          −
        </button>
      ) : null}
    </>
  )
}

/**
 * One picker per slot on the screen being edited. The board decides which group
 * a slot shows from a tap or a rule, so this is purely a way to look at the
 * others while authoring them.
 */
function SlotTabs(): React.JSX.Element | null {
  const configuration = useDeviceStore((state) => state.draft)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const previewSlots = useDashboardEditorStore((state) => state.previewSlots)
  const setPreviewSlot = useDashboardEditorStore((state) => state.setPreviewSlot)
  // Containers nest, so a slot member can be at any depth: the whole screen is
  // swept rather than one array.
  const containers = screenWidgetsOf(screensOf(configuration)[activeScreenIndex]).filter(
    (widget): widget is ShapeWidgetConfiguration => widget.type === 'shape'
  )
  const slots = [...new Set(containers.map((shape) => shape.slot ?? 0))].filter((slot) => slot > 0)
  if (slots.length === 0) return null
  return (
    <>
      {slots.map((slot) => {
        const members = containers.filter((shape) => (shape.slot ?? 0) === slot)
        const shown = members.find((shape) => visibleInSlot(containers, shape, previewSlots))
        return (
          <label key={slot} className="flex items-center gap-1 text-muted-foreground">
            <span>{`slot ${slot}`}</span>
            <select
              className="h-7 rounded-md border bg-background px-1 text-foreground"
              value={shown?.id ?? ''}
              onChange={(event) => setPreviewSlot(slot, event.target.value)}
            >
              {members.map((shape) => (
                <option key={shape.id} value={shape.id}>
                  {shape.id}
                </option>
              ))}
            </select>
          </label>
        )
      })}
    </>
  )
}

/**
 * Arrangement acts on the selection and the view controls act on the canvas, so
 * neither belongs with the buttons that add widgets. Alignment appears only
 * once there is a selection to align, which is also when it starts meaning
 * anything.
 */
export function ArrangeToolbar({ display }: { display: DisplayDescriptor }): React.JSX.Element {
  const selectedIds = useDashboardEditorStore((state) => state.selectedIds)
  const view = useDashboardEditorStore((state) => state.view)
  const setView = useDashboardEditorStore((state) => state.setView)
  const distributable = selectedIds.length >= 3
  const zoomTo = (zoom: number): void => setView({ zoom, ...clampPan(view, display, zoom) })
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <ScreenTabs />
      <SlotTabs />
      <span className="mx-1 h-4 w-px bg-border" />
      {selectedIds.length >= 2 ? (
        <>
          <button
            type="button"
            title="Wrap the selection in a container (Cmd/Ctrl+G)"
            className="h-7 rounded-md border px-2 hover:bg-muted"
            onClick={() => {
              const id = wrapInShape(selectedIds)
              if (id) useDashboardEditorStore.getState().select({ type: 'widget', id })
            }}
          >
            Wrap
          </button>
          <span className="mx-1 h-4 w-px bg-border" />
        </>
      ) : null}
      <button
        type="button"
        title="Add an invisible rectangle that takes a tap"
        className="h-7 rounded-md border px-2 hover:bg-muted"
        onClick={() => {
          const id = addTapZone(display)
          if (id) useDashboardEditorStore.getState().select({ type: 'widget', id })
        }}
      >
        Tap zone
      </button>
      <span className="mx-1 h-4 w-px bg-border" />
      {selectedIds.length >= 2 ? (
        <>
          <span className="mr-1 text-muted-foreground">{`${selectedIds.length} selected`}</span>
          {ALIGNMENTS.map(({ edge, label, title }) => (
            <button key={edge} type="button" title={title} className="h-7 rounded-md border px-2 hover:bg-muted" onClick={() => alignWidgets(selectedIds, edge)}>
              {label}
            </button>
          ))}
          <button type="button" title="Space evenly across" disabled={!distributable} className="h-7 rounded-md border px-2 hover:bg-muted disabled:opacity-40" onClick={() => distributeWidgets(selectedIds, 'horizontal')}>
            ⇹
          </button>
          <button type="button" title="Space evenly down" disabled={!distributable} className="h-7 rounded-md border px-2 hover:bg-muted disabled:opacity-40" onClick={() => distributeWidgets(selectedIds, 'vertical')}>
            ⇵
          </button>
          <span className="mx-1 h-4 w-px bg-border" />
        </>
      ) : null}
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={view.snapToGrid} onChange={(event) => setView({ snapToGrid: event.target.checked })} />
        Grid
      </label>
      <input
        aria-label="Grid size"
        type="number"
        min={1}
        max={64}
        value={view.gridSize}
        disabled={!view.snapToGrid}
        className="h-7 w-14 rounded-md border bg-transparent px-1 disabled:opacity-40"
        onChange={(event) => setView({ gridSize: Math.max(1, Math.round(Number(event.target.value) || 1)) })}
      />
      <span className="mx-1 h-4 w-px bg-border" />
      <PreviewValuesControls />
      <span className="mx-1 h-4 w-px bg-border" />
      <button type="button" title="Zoom out" className="h-7 rounded-md border px-2 hover:bg-muted" onClick={() => zoomTo(Math.max(MINIMUM_ZOOM, view.zoom / 2))}>−</button>
      <span className="w-10 text-center text-muted-foreground">{`${Math.round(view.zoom * 100)}%`}</span>
      <button type="button" title="Zoom in" className="h-7 rounded-md border px-2 hover:bg-muted" onClick={() => zoomTo(Math.min(MAXIMUM_ZOOM, view.zoom * 2))}>+</button>
      <button type="button" title="Fit the whole display" className="h-7 rounded-md border px-2 hover:bg-muted" onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })}>Fit</button>
      {view.zoom > 1 ? <span className="text-muted-foreground">middle-drag to pan</span> : null}
    </div>
  )
}

/**
 * The configurator never receives telemetry — the control protocol has no
 * command for it and SimHub owns the port while a session runs — so the canvas
 * plays a synthetic lap instead. `Unavailable` is a mode of its own because the
 * live mode resolves every source, which would otherwise leave no way to see
 * what a dashboard looks like when the game stops sending.
 */
function PreviewValuesControls(): React.JSX.Element {
  const preview = useDashboardEditorStore((state) => state.preview)
  const setPreview = useDashboardEditorStore((state) => state.setPreview)
  const live = preview.mode === 'values'
  return (
    <>
      <select
        aria-label="Preview values"
        className="h-7 rounded-md border bg-transparent px-1"
        value={preview.mode}
        onChange={(event) => setPreview({ mode: event.target.value as PreviewValueMode })}
      >
        <option value="placeholders">Placeholders</option>
        <option value="values">Live values</option>
        <option value="unavailable">Unavailable</option>
      </select>
      {live ? (
        <>
          <button
            type="button"
            title={preview.playing ? 'Pause the lap' : 'Play the lap'}
            className="h-7 rounded-md border px-2 hover:bg-muted"
            onClick={() => setPreview({ playing: !preview.playing })}
          >
            {preview.playing ? '❙❙' : '▶'}
          </button>
          <input
            aria-label="Lap position"
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={preview.phase}
            className="w-24"
            // Scrubbing is a way to stop on a state worth judging — the limiter,
            // the braking zone — so it pauses rather than fighting the clock.
            onChange={(event) => setPreview({ phase: Number(event.target.value), playing: false })}
          />
          <span className="w-10 text-right text-muted-foreground">
            {`${(preview.phase * LAP_SECONDS).toFixed(0)}s`}
          </span>
        </>
      ) : null}
    </>
  )
}

const ALIGNMENTS: { edge: AlignmentEdge; label: string; title: string }[] = [
  { edge: 'left', label: '⇤', title: 'Align left edges' },
  { edge: 'center', label: '↔', title: 'Align horizontal centres' },
  { edge: 'right', label: '⇥', title: 'Align right edges' },
  { edge: 'top', label: '⤒', title: 'Align top edges' },
  { edge: 'middle', label: '↕', title: 'Align vertical centres' },
  { edge: 'bottom', label: '⤓', title: 'Align bottom edges' }
]
