import { useEffect, useId, useRef, useState } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useDeviceStore } from '@/features/device/device-store'
import {
  allWidgetsOf,
  dashboardBindings,
  groupsOf,
  screensOf,
  widgetsOf
} from '../../../../shared/configuration-access'
import { LAP_SECONDS, mockTelemetry, mockValue } from '../../../../shared/mock-telemetry'
import { TELEMETRY_CATALOG } from '../../../../shared/telemetry-catalog'
import {
  conditionValue,
  rangeFraction,
  UNAVAILABLE,
  type TelemetryValue
} from '../../../../shared/telemetry-value'
import {
  placeholderBody,
  transformedBody,
  withAffixes
} from '../../../../shared/value-format'
import {
  blinkVisible,
  resolveWidgetStyle,
  type AuthoredStyle,
  type ResolvedStyle,
  type StyledFrame
} from '../../../../shared/widget-style'
import { MAXIMUM_GRAPH_POINTS } from '../../../../shared/configuration-schema'
import type {
  ArcWidgetConfiguration,
  GroupConfiguration,
  WidgetAction,
  ImageWidgetConfiguration,
  BarWidgetConfiguration,
  GradientDirection,
  GraphWidgetConfiguration,
  IndicatorWidgetConfiguration,
  FontSpec,
  ShapeWidgetConfiguration,
  TextWidgetConfiguration,
  WidgetConfiguration,
  WidgetInsets
} from '../../../../shared/configuration-schema'
import type { DeviceConfiguration, DisplayDescriptor } from '../../../../shared/device'
import { BOARD_PROFILES } from '../../../../shared/device'
import type { PreviewPlayback, PreviewValueMode } from './dashboard-editor'
import { previewFontFamily, usePreviewAssetStore } from './preview-assets'
import { measureGlyphs, type GlyphMetrics } from './text-metrics'
import {
  absolutePlacement,
  addScreen,
  addTapZone,
  findGroup,
  deleteScreen,
  groupWidgets,
  MAXIMUM_SCREENS,
  parentOffset,
  addArcWidget,
  addBarWidget,
  addGraphWidget,
  addImageWidget,
  addIndicatorWidget,
  duplicateWidget,
  addShapeWidget,
  addTextWidget,
  completePlacement,
  draftValueFont,
  alignWidgets,
  deleteWidget,
  distributeWidgets,
  findWidget,
  MAXIMUM_TEXT_WIDGETS,
  MAXIMUM_ZOOM,
  MINIMUM_ZOOM,
  mutateDraftConfiguration,
  useDashboardEditorStore,
  type AlignmentEdge,
  type WidgetSelection
} from './dashboard-editor'

type FramedWidgetConfiguration =
  | TextWidgetConfiguration
  | ShapeWidgetConfiguration
  | BarWidgetConfiguration
  | ArcWidgetConfiguration
  | IndicatorWidgetConfiguration
  | GraphWidgetConfiguration
  | ImageWidgetConfiguration

const SCREEN_BACKGROUND = '#000000'
const DEFAULT_TEXT_COLOR = '#E8E8E8'
const DEFAULT_BORDER_COLOR = '#AEAEAE'

export function DisplayPreview(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draft = useDeviceStore((state) => state.draft)
  const pendingConfiguration = useDeviceStore((state) => state.pendingConfiguration)
  const configuration = draft ?? pendingConfiguration ?? session?.configuration
  const display = configuration
    ? BOARD_PROFILES[configuration.board]?.display
    : session?.info.display
  const selection = useDashboardEditorStore((state) => state.selection)
  const select = useDashboardEditorStore((state) => state.select)
  // The cached faces and bitmaps change only when a package is installed or
  // cleared, which is exactly when the board starts reporting a different set
  // of them. Reading them at all is what lets the canvas draw with the font the
  // board rasterizes instead of a stand-in.
  const refreshPreviewAssets = usePreviewAssetStore((state) => state.refresh)
  const installedAssets = [
    ...(session?.fontAssets?.families ?? []),
    ...(session?.imageAssets?.images ?? []).map((image) => image.name)
  ].join(' ')
  useEffect(() => {
    void refreshPreviewAssets()
  }, [refreshPreviewAssets, installedAssets])
  const canUndo = useDeviceStore((state) => state.past.length > 0)
  const canRedo = useDeviceStore((state) => state.future.length > 0)
  const undo = useDeviceStore((state) => state.undo)
  const redo = useDeviceStore((state) => state.redo)
  // A new reading takes the font the dashboard already draws with. Reading it
  // from the connected board instead meant a widget landed in whichever family
  // happened to be installed first, at a fixed size unrelated to its
  // neighbours — and with no board connected it got no font at all, which the
  // validator then rejected the whole document over.
  const defaultFont = draftValueFont(configuration, session?.fontAssets?.families[0])
  // Widget storage is a dashboard-wide pool, so the cap counts every screen.
  const textWidgetCount = allWidgetsOf(configuration).filter(
    (widget) => widget.type === 'text'
  ).length
  const selectedExists =
    selection?.type === 'widget' && Boolean(findWidget(configuration, selection.id))
  const displayRatio = display
    ? display.width / display.height
    : 16 / 9
  const surfaceMaximumWidth = `max(8rem, calc((100vh - 13rem) * ${displayRatio}))`

  return (
    <Card
      className="flex max-h-full w-full flex-col bg-background/70"
      style={{ maxWidth: `calc(${surfaceMaximumWidth} + 2rem)` }}
    >
      <CardHeader className="flex-none py-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Display preview</CardTitle>
          <div className="flex flex-wrap justify-end gap-2">
            <Button className="h-8 w-20" variant="outline" disabled={!configuration || textWidgetCount >= MAXIMUM_TEXT_WIDGETS} title={textWidgetCount >= MAXIMUM_TEXT_WIDGETS ? `Maximum of ${MAXIMUM_TEXT_WIDGETS} text widgets reached.` : undefined} onClick={() => {
              if (!display) return
              const added = addTextWidget(display, defaultFont)
              if (added) select(added)
            }}>+ Text</Button>
            <Button className="h-8 w-20" variant="outline" disabled={!configuration} onClick={() => {
              if (!display) return
              const added = addShapeWidget(display)
              if (added) select(added)
            }}>+ Shape</Button>
            <Button className="h-8 w-20" variant="outline" disabled={!configuration} onClick={() => {
              if (!display) return
              const added = addBarWidget(display)
              if (added) select(added)
            }}>+ Bar</Button>
            <Button className="h-8 w-20" variant="outline" disabled={!configuration} onClick={() => {
              if (!display) return
              const added = addArcWidget(display)
              if (added) select(added)
            }}>+ Arc</Button>
            <Button className="h-8 w-24" variant="outline" disabled={!configuration} onClick={() => {
              if (!display) return
              const added = addIndicatorWidget(display)
              if (added) select(added)
            }}>+ Lights</Button>
            <Button className="h-8 w-20" variant="outline" disabled={!configuration} onClick={() => {
              if (!display) return
              const added = addGraphWidget(display)
              if (added) select(added)
            }}>+ Graph</Button>
            <Button className="h-8 w-20" variant="outline" disabled={!configuration} onClick={() => {
              if (!display) return
              const added = addImageWidget(display, session?.imageAssets?.images[0]?.name)
              if (added) select(added)
            }}>+ Image</Button>
            <Button className="h-8 w-20" variant="outline" disabled={!selectedExists} title="Duplicate the selected widget (Cmd/Ctrl+D)" onClick={() => {
              if (!display || !selection) return
              const added = duplicateWidget(selection, display)
              if (added) select(added)
            }}>Duplicate</Button>
            <Button className="h-8 w-10" variant="outline" disabled={!canUndo} title="Undo (Cmd/Ctrl+Z)" onClick={() => undo()}>↶</Button>
            <Button className="h-8 w-10" variant="outline" disabled={!canRedo} title="Redo (Shift+Cmd/Ctrl+Z)" onClick={() => redo()}>↷</Button>
            <Button className="h-8 w-20" variant="outline" disabled={!selectedExists} title="Delete the selected widget (Delete)" onClick={() => {
              if (!selection) return
              if (deleteWidget(selection)) select(undefined)
            }}>Delete</Button>
          </div>
        </div>
        {display ? <ArrangeToolbar display={display} /> : null}
        <CardDescription>
          {display
            ? `${display.width} × ${display.height} logical pixels · ${configuration?.board ?? 'connected board'}`
            : 'Create, load, or connect a configuration to start editing.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-4 pb-4">
        <div
          className="relative mx-auto w-full max-w-full overflow-hidden rounded-md border bg-black shadow-2xl"
          style={{
            maxWidth: surfaceMaximumWidth,
            aspectRatio: display
              ? `${display.width} / ${display.height}`
              : '16 / 9'
          }}
        >
          {display && configuration ? (
            <Widgets configuration={configuration} display={display} />
          ) : (
            <div className="flex size-full items-center justify-center text-sm text-zinc-600">
              No local configuration
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

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
  const groups = groupsOf(screensOf(configuration)[activeScreenIndex])
  const slots = [...new Set(groups.map((group) => group.slot ?? 0))].filter((slot) => slot > 0)
  if (slots.length === 0) return null
  return (
    <>
      {slots.map((slot) => {
        const members = groups.filter((group) => (group.slot ?? 0) === slot)
        const shown = members.find((group) => visibleInSlot(groups, group, previewSlots))
        return (
          <label key={slot} className="flex items-center gap-1 text-muted-foreground">
            <span>{`slot ${slot}`}</span>
            <select
              className="h-7 rounded-md border bg-background px-1 text-foreground"
              value={shown?.id ?? ''}
              onChange={(event) => setPreviewSlot(slot, event.target.value)}
            >
              {members.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.id}
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
 * once there is a group to align, which is also when it starts meaning
 * anything.
 */
function ArrangeToolbar({ display }: { display: DisplayDescriptor }): React.JSX.Element {
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
            title="Group the selection (Cmd/Ctrl+G)"
            className="h-7 rounded-md border px-2 hover:bg-muted"
            onClick={() => {
              const id = groupWidgets(selectedIds)
              if (id) useDashboardEditorStore.getState().select({ type: 'group', id })
            }}
          >
            Group
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
          if (id) useDashboardEditorStore.getState().select({ type: 'group', id })
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

function Widgets({
  configuration,
  display
}: {
  configuration: DeviceConfiguration
  display: DisplayDescriptor
}): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const selection = useDashboardEditorStore((state) => state.selection)
  const selectedIds = useDashboardEditorStore((state) => state.selectedIds)
  const select = useDashboardEditorStore((state) => state.select)
  const extendSelection = useDashboardEditorStore((state) => state.extendSelection)
  const selectMany = useDashboardEditorStore((state) => state.selectMany)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const previewSlots = useDashboardEditorStore((state) => state.previewSlots)
  const view = useDashboardEditorStore((state) => state.view)
  const locked = useDashboardEditorStore((state) => state.locked)
  const hidden = useDashboardEditorStore((state) => state.hidden)
  const [interaction, setInteraction] = useState<Interaction>()
  const [marquee, setMarquee] = useState<Marquee>()
  const [pan, setPan] = useState<Pan>()
  const [guides, setGuides] = useState<Guides>(NO_GUIDES)
  const playback = useDashboardEditorStore((state) => state.preview)
  // Blink runs off the wall clock rather than off the lap, the way the device
  // runs it off ticks: it is a property of the frame being drawn, not of the
  // value, so scrubbing to a paused phase still shows the widget flashing.
  const [clockMs, setClockMs] = useState(0)
  const playing = playback.playing && playback.mode === 'values'
  useEffect(() => {
    if (playback.mode !== 'values') return
    const started = Date.now()
    const timer = setInterval(() => {
      setClockMs(Date.now() - started)
      // The lap advances only while playing; the clock keeps running either way
      // so a paused frame still blinks.
      if (!playing) return
      const { preview, setPreview } = useDashboardEditorStore.getState()
      setPreview({ phase: (preview.phase + PREVIEW_TICK_MS / (LAP_SECONDS * 1000)) % 1 })
    }, PREVIEW_TICK_MS)
    return () => clearInterval(timer)
  }, [playback.mode, playing])
  const values = createPreviewValues(configuration, playback, clockMs)
  const screen = screensOf(configuration)[activeScreenIndex]
  const screenBackground = screen?.background_color ?? SCREEN_BACKGROUND
  const allGroups = groupsOf(screen)
  // The board shows one group per slot; the canvas has to author all of them,
  // so it draws the one picked in the toolbar and leaves the rest out rather
  // than stacking a slot's groups on top of each other.
  const groups = allGroups.filter((group) => visibleInSlot(allGroups, group, previewSlots))
  // The canvas works entirely in display coordinates. Geometry inside a group
  // is relative to the group's box, so it is translated here on the way out and
  // translated back before anything is written to the document.
  const widgets = [...widgetsOf(screen), ...groups.flatMap(widgetsOf)]

  const selectedGroupPlacement =
    selection?.type === 'group'
      ? completePlacement(findGroup(configuration, selection.id)?.group.placement)
      : undefined
  const selectedPlacements = [
    ...selectedIds
      .map((id) => absolutePlacement(configuration, id))
      .filter((placement): placement is Placement => placement !== undefined),
    ...(selectedGroupPlacement ? [selectedGroupPlacement] : [])
  ]
  // A group resizes like a widget: its box is the thing being dragged, and its
  // children keep the offsets they were authored with.
  const primaryPlacement =
    selection?.type === 'widget'
      ? absolutePlacement(configuration, selection.id)
      : selectedGroupPlacement

  const beginInteraction = (
    event: React.PointerEvent<SVGElement>,
    target: WidgetSelection,
    mode: InteractionMode,
    placement: Placement
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    if (target.type === 'widget' && event.shiftKey) {
      extendSelection(target.id)
      return
    }
    // Dragging one of several selected widgets moves the group; dragging an
    // unselected one starts a new selection, which is what a click on it means.
    const group =
      target.type === 'widget' && selectedIds.includes(target.id)
        ? selectedIds
        : (select(target), target.type === 'widget' ? [target.id] : [])
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    if (!point) return
    svgRef.current?.setPointerCapture(event.pointerId)
    // One commit per frame is still one gesture, so the whole drag collapses
    // into a single history entry.
    useDeviceStore.getState().beginEdit()
    setInteraction({
      pointerId: event.pointerId,
      target,
      mode,
      start: point,
      placement,
      followers:
        mode === 'move'
          ? group
              .filter((id) => id !== (target.type === 'widget' ? target.id : ''))
              .map((id) => ({ id, placement: absolutePlacement(configuration, id) }))
              .filter((entry): entry is Follower => entry.placement !== undefined)
          : []
    })
  }

  // A pointer stream can outpace the frame rate, and each commit rewrites the
  // whole document. Coalescing to one commit per frame keeps dragging smooth.
  //
  // The coalesced work is kept beside its frame id so releasing the pointer can
  // run it rather than drop it. Cancelling the frame alone loses everything
  // between the last painted frame and the release — a slow drag gave up a few
  // pixels, and a quick one gave up the whole gesture.
  const pendingFrame = useRef<number | undefined>(undefined)
  const pendingCommit = useRef<(() => void) | undefined>(undefined)
  const flushPendingCommit = (): void => {
    if (pendingFrame.current !== undefined) {
      cancelAnimationFrame(pendingFrame.current)
      pendingFrame.current = undefined
    }
    const commit = pendingCommit.current
    pendingCommit.current = undefined
    commit?.()
  }
  useEffect(() => () => {
    if (pendingFrame.current !== undefined) cancelAnimationFrame(pendingFrame.current)
    pendingCommit.current = undefined
  }, [])

  const snapTargets = (): SnapTargets =>
    collectSnapTargets(widgets, display, interaction?.target, hidden)

  const movePointer = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (pan && event.pointerId === pan.pointerId) {
      const scale = viewportScale(svgRef.current, display, view.zoom)
      setPan(pan)
      useDashboardEditorStore.getState().setView(
        clampPan(
          {
            panX: pan.startPanX - (event.clientX - pan.startClientX) / scale,
            panY: pan.startPanY - (event.clientY - pan.startClientY) / scale
          },
          display,
          view.zoom
        )
      )
      return
    }
    if (marquee && event.pointerId === marquee.pointerId) {
      const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
      if (point) setMarquee({ ...marquee, current: point })
      return
    }
    if (!interaction || event.pointerId !== interaction.pointerId) return
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    if (!point) return
    const dx = point.x - interaction.start.x
    const dy = point.y - interaction.start.y
    if (pendingFrame.current !== undefined) cancelAnimationFrame(pendingFrame.current)
    pendingCommit.current = () => {
      const resolved = transformedPlacement(interaction, dx, dy, display, {
        grid: view.snapToGrid ? view.gridSize : 0,
        // Snapping is in logical pixels, so the tolerance shrinks as the canvas
        // is magnified and stays the same distance under the pointer.
        tolerance: SNAP_TOLERANCE_PX / view.zoom,
        targets: snapTargets()
      })
      setGuides(resolved.guides)
      const shiftX = resolved.placement.x - interaction.placement.x
      const shiftY = resolved.placement.y - interaction.placement.y
      mutateDraftConfiguration((draft) => {
        // A group's box is already in display coordinates, so it takes the
        // resolved placement as-is and has no followers to shift.
        if (interaction.target.type === 'group') {
          const group = findGroup(draft, interaction.target.id)?.group
          if (group) group.placement = resolved.placement
          return
        }
        const primaryId = interaction.target.type === 'widget' ? interaction.target.id : ''
        const primary = findWidget(draft, primaryId)
        if (primary) {
          const offset = parentOffset(draft, primaryId)
          primary.widget.placement = {
            ...resolved.placement,
            x: resolved.placement.x - offset.x,
            y: resolved.placement.y - offset.y
          }
        }
        for (const follower of interaction.followers) {
          const widget = findWidget(draft, follower.id)?.widget
          if (!widget) continue
          const offset = parentOffset(draft, follower.id)
          widget.placement = {
            ...follower.placement,
            x: Math.round(
              clamp(follower.placement.x + shiftX, 0, display.width - follower.placement.width)
            ) - offset.x,
            y: Math.round(
              clamp(follower.placement.y + shiftY, 0, display.height - follower.placement.height)
            ) - offset.y
          }
        }
      })
    }
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = undefined
      const commit = pendingCommit.current
      pendingCommit.current = undefined
      commit?.()
    })
  }

  const finishPointer = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (pan?.pointerId === event.pointerId) {
      svgRef.current?.releasePointerCapture(event.pointerId)
      setPan(undefined)
      return
    }
    if (marquee?.pointerId === event.pointerId) {
      svgRef.current?.releasePointerCapture(event.pointerId)
      const bounds = marqueeBounds(marquee)
      // A click rather than a drag: the screen is what was picked.
      if (bounds.width < 2 && bounds.height < 2) {
        if (!marquee.additive) select({ type: 'screen' })
      } else {
        const caught = widgets
          .filter((widget) => widget.id && !hidden[widget.id] && !locked[widget.id])
          .filter((widget) => {
            const placement = absolutePlacement(configuration, widget.id as string)
            return placement !== undefined && intersects(placement, bounds)
          })
          .map((widget) => widget.id as string)
        selectMany(marquee.additive ? [...new Set([...selectedIds, ...caught])] : caught)
      }
      setMarquee(undefined)
      return
    }
    if (interaction?.pointerId !== event.pointerId) return
    svgRef.current?.releasePointerCapture(event.pointerId)
    // The last move may still be waiting for a frame; it has to land, and it
    // has to land inside the history group this gesture opened.
    flushPendingCommit()
    useDeviceStore.getState().endEdit()
    setInteraction(undefined)
    setGuides(NO_GUIDES)
  }

  // Zooming at the pointer keeps whatever is under it under it, which is what
  // makes magnifying a corner of the display usable at all.
  const zoomAtPointer = (event: React.WheelEvent<SVGSVGElement>): void => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    const zoom = clamp(
      view.zoom * (event.deltaY < 0 ? 1.25 : 0.8),
      MINIMUM_ZOOM,
      MAXIMUM_ZOOM
    )
    if (!point) {
      useDashboardEditorStore.getState().setView({ zoom, ...clampPan(view, display, zoom) })
      return
    }
    useDashboardEditorStore.getState().setView({
      zoom,
      ...clampPan(
        {
          panX: point.x - (point.x - view.panX) * (view.zoom / zoom),
          panY: point.y - (point.y - view.panY) * (view.zoom / zoom)
        },
        display,
        zoom
      )
    })
  }

  const beginBackground = (event: React.PointerEvent<SVGSVGElement>): void => {
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    if (!point) return
    svgRef.current?.setPointerCapture(event.pointerId)
    // The middle button pans, which leaves the left button free for the
    // rubber band even when the canvas is magnified.
    if (event.button === 1) {
      event.preventDefault()
      setPan({
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: view.panX,
        startPanY: view.panY
      })
      return
    }
    setMarquee({
      pointerId: event.pointerId,
      start: point,
      current: point,
      additive: event.shiftKey
    })
  }

  // Same rule the firmware applies: z_index ascending, authored array order
  // breaking ties. A group is one entry at screen level and orders its own
  // children within itself, exactly as one LVGL parent orders its children.
  const screenWidgets = widgetsOf(screen)
  const entries: ScreenEntry[] = [
    ...screenWidgets.map((widget, index) => ({
      kind: 'widget' as const,
      widget,
      zIndex: widget.z_index ?? 0,
      configurationOrder: index
    })),
    ...groups.map((group, index) => ({
      kind: 'group' as const,
      group,
      groupIndex: index,
      zIndex: group.z_index ?? 0,
      configurationOrder: screenWidgets.length + index
    }))
  ]
  entries.sort((left, right) =>
    left.zIndex - right.zIndex || left.configurationOrder - right.configurationOrder
  )
  const layers: PreviewLayer[] = entries.flatMap((entry) => {
    if (entry.kind === 'widget') {
      return [
        {
          configuration: entry.widget,
          zIndex: entry.zIndex,
          configurationOrder: entry.configurationOrder,
          offsetX: 0,
          offsetY: 0
        }
      ]
    }
    const box = completePlacement(entry.group.placement)
    const members = widgetsOf(entry.group)
      .map((widget, index) => ({
        configuration: widget,
        zIndex: widget.z_index ?? 0,
        configurationOrder: index,
        offsetX: box?.x ?? 0,
        offsetY: box?.y ?? 0,
        group: entry.group,
        groupIndex: entry.groupIndex
      }))
    members.sort((left, right) =>
      left.zIndex - right.zIndex || left.configurationOrder - right.configurationOrder
    )
    return members
  })

  // Widgets carry their action on the frame and groups carry it on themselves,
  // so both are collected the same way and drawn in display coordinates.
  const tapTargets = [
    ...layers
      .filter((layer) => layer.configuration.action?.type && layer.configuration.action.type !== 'none')
      .map((layer) => ({
        id: layer.configuration.id ?? '',
        placement: layer.configuration.id
          ? absolutePlacement(configuration, layer.configuration.id)
          : undefined,
        label: actionLabel(layer.configuration.action)
      })),
    ...groups
      .filter((group) => group.action?.type && group.action.type !== 'none')
      .map((group) => ({
        id: group.id ?? '',
        placement: completePlacement(group.placement),
        label: actionLabel(group.action)
      }))
  ].filter(
    (entry): entry is { id: string; placement: Placement; label: string } =>
      entry.placement !== undefined
  )

  const viewWidth = display.width / view.zoom
  const viewHeight = display.height / view.zoom
  const band = marquee ? marqueeBounds(marquee) : undefined

  return (
    <svg
      ref={svgRef}
      aria-label="Dashboard display preview"
      className="block size-full touch-none select-none"
      preserveAspectRatio="xMidYMid meet"
      viewBox={`${view.panX} ${view.panY} ${viewWidth} ${viewHeight}`}
      onPointerMove={movePointer}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onPointerDown={beginBackground}
      onWheel={zoomAtPointer}
    >
      <rect width={display.width} height={display.height} fill={screenBackground} />
      {view.snapToGrid ? <GridOverlay display={display} size={view.gridSize} zoom={view.zoom} /> : null}
      {/* Drawn before the widgets, so a widget always wins the pointer over the
          group behind it. The border is a wide invisible band rather than the
          1px dash, because grabbing a hairline is not an interaction; and once a
          group is selected — or when it is empty, and so has nothing else to
          grab — its whole body drags, which is what makes a tap zone usable at
          all. An unselected populated group leaves its middle transparent so
          rubber-band selection still starts there. */}
      {groups.map((group) => {
        const box = completePlacement(group.placement)
        if (!box) return null
        const active = selection?.type === 'group' && selection.id === group.id
        const empty = widgetsOf(group).length === 0
        return (
          <g key={`group-${group.id}`}>
            <rect
              {...box}
              fill="none"
              stroke={group.action && group.action.type !== 'none' ? '#38F5A8' : '#A78BFA'}
              strokeWidth={(active ? 2 : 1) / view.zoom}
              strokeDasharray={`${2 / view.zoom} ${4 / view.zoom}`}
              pointerEvents="none"
            />
            <rect
              {...box}
              fill="transparent"
              stroke="transparent"
              strokeWidth={GROUP_GRAB_PX / view.zoom}
              pointerEvents={active || empty ? 'all' : 'stroke'}
              style={{ cursor: 'move' }}
              onPointerDown={(event) => {
                if (!group.id) return
                beginInteraction(event, { type: 'group', id: group.id }, 'move', box)
              }}
            />
          </g>
        )
      })}
      {groups.map((group, index) => {
        const box = completePlacement(group.placement)
        // The clip is resolved in the coordinate system of the element that
        // references it, and that element already carries the group's
        // translate — so the rect is the group's own box at the origin, not its
        // position on the display. Using display coordinates here shifts the
        // clip by the offset a second time and hides the group's contents.
        return box ? (
          <clipPath key={`clip-${group.id}`} id={groupClipId(index)}>
            <rect x={0} y={0} width={box.width} height={box.height} />
          </clipPath>
        ) : null
      })}
      {layers.map((layer, layerIndex) => {
        const id = layer.configuration.id
        if (id && hidden[id]) return null
        const grouped = layer.group !== undefined
        // The widget's own box clips its contents, exactly as its LVGL
        // container does — a value wider than its widget is cut off on the
        // board rather than spilling over its neighbours. The caption is left
        // out of it because the device puts it on the parent, so it may
        // overhang the top border.
        const box = completePlacement(layer.configuration.placement)
        return (
          <g
            key={id ?? layer.configurationOrder}
            transform={grouped ? `translate(${layer.offsetX} ${layer.offsetY})` : undefined}
            clipPath={
              grouped && layer.groupIndex !== undefined
                ? `url(#${groupClipId(layer.groupIndex)})`
                : undefined
            }
            onPointerDown={(event) => {
            const placement = id ? absolutePlacement(configuration, id) : undefined
            if (!placement || !id || locked[id]) return
            beginInteraction(event, { type: 'widget', id }, 'move', placement)
          }}>
            {box ? (
              <clipPath id={widgetClipId(layerIndex)}>
                <rect {...box} />
              </clipPath>
            ) : null}
            <g clipPath={box ? `url(#${widgetClipId(layerIndex)})` : undefined}>
              {layer.configuration.type === 'bar' ? (
                <BarPreview configuration={layer.configuration} values={values} />
              ) : layer.configuration.type === 'arc' ? (
                <ArcPreview configuration={layer.configuration} values={values} />
              ) : layer.configuration.type === 'indicator' ? (
                <IndicatorPreview configuration={layer.configuration} values={values} />
              ) : layer.configuration.type === 'graph' ? (
                <GraphPreview configuration={layer.configuration} values={values} />
              ) : layer.configuration.type === 'image' ? (
                <ImagePreview configuration={layer.configuration} values={values} />
              ) : layer.configuration.type === 'shape' ? (
                <ShapePreview configuration={layer.configuration} values={values} />
              ) : (
                <TextWidgetPreview configuration={layer.configuration} values={values} />
              )}
            </g>
            <CaptionPreview configuration={layer.configuration} />
            {id && locked[id] ? null : (
              <HitArea placement={completePlacement(layer.configuration.placement)} />
            )}
          </g>
        )
      })}
      {/* A tap target is only a tap target on the board, so the canvas says so:
          an empty group would otherwise be an invisible rectangle. */}
      {tapTargets.map(({ id, placement, label }) => (
        <g key={`action-${id}`} pointerEvents="none">
          <rect
            {...placement}
            fill="none"
            stroke="#38F5A8"
            strokeWidth={1 / view.zoom}
            strokeDasharray={`${5 / view.zoom} ${3 / view.zoom}`}
          />
          <text
            x={placement.x + 2 / view.zoom}
            y={placement.y + 10 / view.zoom}
            fill="#38F5A8"
            fontSize={9 / view.zoom}
          >
            {label}
          </text>
        </g>
      ))}
      {/* Every selected widget is outlined; only the primary one carries the
          resize handles, because a resize has one anchor. */}
      {selectedPlacements.map((placement, index) => (
        <rect
          key={index}
          {...placement}
          fill="none"
          stroke="#38BDF8"
          strokeWidth={1 / view.zoom}
          strokeDasharray={`${4 / view.zoom} ${3 / view.zoom}`}
          pointerEvents="none"
        />
      ))}
      <GuideOverlay guides={guides} display={display} zoom={view.zoom} />
      {selection && primaryPlacement ? (
        <SelectionFrame
          placement={primaryPlacement}
          zoom={view.zoom}
          onResize={(event, mode) => beginInteraction(event, selection, mode, primaryPlacement)}
        />
      ) : null}
      {band && (band.width >= 2 || band.height >= 2) ? (
        <rect
          {...band}
          fill="#38BDF8"
          fillOpacity={0.12}
          stroke="#38BDF8"
          strokeWidth={1 / view.zoom}
          pointerEvents="none"
        />
      ) : null}
    </svg>
  )
}

function GridOverlay({ display, size, zoom }: { display: DisplayDescriptor; size: number; zoom: number }): React.JSX.Element | null {
  if (size <= 0) return null
  // A grid finer than a couple of screen pixels reads as a wash rather than as
  // a grid, so it is left out until the canvas is magnified enough to show it.
  const step = size * zoom >= 4 ? size : size * Math.ceil(4 / (size * zoom))
  const lines: React.JSX.Element[] = []
  for (let x = step; x < display.width; x += step) {
    lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={display.height} stroke="#94A3B8" strokeOpacity={0.18} strokeWidth={1 / zoom} />)
  }
  for (let y = step; y < display.height; y += step) {
    lines.push(<line key={`y${y}`} x1={0} y1={y} x2={display.width} y2={y} stroke="#94A3B8" strokeOpacity={0.18} strokeWidth={1 / zoom} />)
  }
  return <g pointerEvents="none">{lines}</g>
}

function GuideOverlay({ guides, display, zoom }: { guides: Guides; display: DisplayDescriptor; zoom: number }): React.JSX.Element {
  return (
    <g pointerEvents="none">
      {guides.x.map((x) => (
        <line key={`gx${x}`} x1={x} y1={0} x2={x} y2={display.height} stroke="#F472B6" strokeWidth={1 / zoom} />
      ))}
      {guides.y.map((y) => (
        <line key={`gy${y}`} x1={0} y1={y} x2={display.width} y2={y} stroke="#F472B6" strokeWidth={1 / zoom} />
      ))}
    </g>
  )
}

interface PreviewLayer {
  configuration: WidgetConfiguration
  zIndex: number
  configurationOrder: number
  /** The group's origin on the display, or zero for a widget on the screen. */
  offsetX: number
  offsetY: number
  group?: GroupConfiguration
  /** Position of the owning group on its screen, which names its clip. */
  groupIndex?: number
}

/**
 * Fragment identifiers referenced from `url(#…)`. They are derived from
 * positions rather than from ids because a widget or group id is author-
 * supplied and bounded only in length — a space or a quote in one would produce
 * markup that silently references nothing.
 */
function groupClipId(index: number): string {
  return `group-clip-${index}`
}

function widgetClipId(index: number): string {
  return `widget-clip-${index}`
}

/**
 * React's generated ids carry punctuation of their own, which the same
 * references cannot take either.
 */
function markupId(generated: string): string {
  return generated.replace(/[^A-Za-z0-9_-]/g, '')
}

/**
 * Whether a group is the one its slot is currently being looked at through.
 * A group outside a slot is always drawn; inside one, the picked group wins and
 * the slot default stands in until something is picked.
 */
function visibleInSlot(
  groups: GroupConfiguration[],
  group: GroupConfiguration,
  picked: Record<number, string>
): boolean {
  const slot = group.slot ?? 0
  if (slot === 0) return true
  const chosen = picked[slot]
  if (chosen !== undefined) return group.id === chosen
  const members = groups.filter((entry) => (entry.slot ?? 0) === slot)
  const fallback = members.find((entry) => entry.slot_default) ?? members[0]
  return group.id === fallback?.id
}

function actionLabel(action: WidgetAction | undefined): string {
  if (!action || action.type === 'none') return ''
  if (action.type === 'goto_screen') return `→ ${action.screen ?? ''}`
  return action.type === 'next_screen' ? '→ next' : '→ prev'
}

// What a screen stacks: its own widgets, and each group as a single entry.
type ScreenEntry =
  | { kind: 'widget'; widget: WidgetConfiguration; zIndex: number; configurationOrder: number }
  | {
      kind: 'group'
      group: GroupConfiguration
      groupIndex: number
      zIndex: number
      configurationOrder: number
    }

type ResizeMode = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type InteractionMode = 'move' | ResizeMode
type Placement = Required<NonNullable<TextWidgetConfiguration['placement']>>

/** A widget that moves with the one under the pointer. */
interface Follower {
  id: string
  placement: Placement
}

interface Interaction {
  pointerId: number
  target: WidgetSelection
  mode: InteractionMode
  start: { x: number; y: number }
  placement: Placement
  followers: Follower[]
}

interface Marquee {
  pointerId: number
  start: { x: number; y: number }
  current: { x: number; y: number }
  additive: boolean
}

interface Pan {
  pointerId: number
  startClientX: number
  startClientY: number
  startPanX: number
  startPanY: number
}

/** Lines the dragged widget snapped to, drawn while the drag is in progress. */
interface Guides {
  x: number[]
  y: number[]
}

const NO_GUIDES: Guides = { x: [], y: [] }

// How close an edge has to be before it snaps, in screen pixels.
const SNAP_TOLERANCE_PX = 6
// Grab band around a group's border, in logical pixels. The visible dash stays
// a hairline; this is only what the pointer has to hit.
const GROUP_GRAB_PX = 10

// Ten frames a second: enough for a colour ramp to read as continuous and for a
// blink to be legible, without re-rendering the canvas at display rate.
const PREVIEW_TICK_MS = 100

interface SnapTargets {
  x: number[]
  y: number[]
}

/**
 * The lines a dragged widget can snap to: every other widget's left, centre and
 * right, its top, middle and bottom, and the display's own edges and centre.
 * Hidden widgets contribute nothing, because a line to something invisible
 * cannot be understood.
 */
function collectSnapTargets(
  widgets: readonly WidgetConfiguration[],
  display: DisplayDescriptor,
  dragged: WidgetSelection | undefined,
  hidden: Readonly<Record<string, boolean>>
): SnapTargets {
  const draggedId = dragged?.type === 'widget' ? dragged.id : undefined
  const x = [0, display.width / 2, display.width]
  const y = [0, display.height / 2, display.height]
  for (const widget of widgets) {
    if (!widget.id || widget.id === draggedId || hidden[widget.id]) continue
    const placement = completePlacement(widget.placement)
    if (!placement) continue
    x.push(placement.x, placement.x + placement.width / 2, placement.x + placement.width)
    y.push(placement.y, placement.y + placement.height / 2, placement.y + placement.height)
  }
  return { x, y }
}

interface SnapOptions {
  grid: number
  tolerance: number
  targets: SnapTargets
}

/**
 * Snaps one coordinate. The widget's own three edges are each tried against
 * every target, and the nearest match within tolerance wins, so a widget lines
 * up by whichever of its edges is closest to something.
 */
function snapAxis(
  start: number,
  size: number,
  targets: readonly number[],
  options: SnapOptions
): { value: number; guide?: number } {
  let best: { value: number; guide: number; distance: number } | undefined
  for (const edge of [0, size / 2, size]) {
    for (const target of targets) {
      const candidate = target - edge
      const distance = Math.abs(candidate - start)
      if (distance > options.tolerance) continue
      if (!best || distance < best.distance) {
        best = { value: candidate, guide: target, distance }
      }
    }
  }
  if (best) return { value: best.value, guide: best.guide }
  if (options.grid > 0) return { value: Math.round(start / options.grid) * options.grid }
  return { value: start }
}

function marqueeBounds(marquee: Marquee): Placement {
  return {
    x: Math.min(marquee.start.x, marquee.current.x),
    y: Math.min(marquee.start.y, marquee.current.y),
    width: Math.abs(marquee.current.x - marquee.start.x),
    height: Math.abs(marquee.current.y - marquee.start.y)
  }
}

function intersects(placement: Placement, bounds: Placement): boolean {
  return (
    placement.x < bounds.x + bounds.width &&
    placement.x + placement.width > bounds.x &&
    placement.y < bounds.y + bounds.height &&
    placement.y + placement.height > bounds.y
  )
}

/** Screen pixels per logical pixel, which is what a pan in client space costs. */
function viewportScale(
  svg: SVGSVGElement | null,
  display: DisplayDescriptor,
  zoom: number
): number {
  const width = svg?.getBoundingClientRect().width ?? display.width
  return (width / display.width) * zoom
}

function clampPan(
  pan: { panX: number; panY: number },
  display: DisplayDescriptor,
  zoom: number
): { panX: number; panY: number } {
  return {
    panX: clamp(pan.panX, 0, display.width - display.width / zoom),
    panY: clamp(pan.panY, 0, display.height - display.height / zoom)
  }
}

function HitArea({ placement }: { placement?: Placement }): React.JSX.Element | null {
  return placement ? <rect {...placement} fill="transparent" className="cursor-move" /> : null
}

function SelectionFrame({ placement, zoom, onResize }: { placement: Placement; zoom: number; onResize: (event: React.PointerEvent<SVGCircleElement>, mode: ResizeMode) => void }): React.JSX.Element {
  const points: Array<[ResizeMode, number, number]> = [
    ['nw', placement.x, placement.y], ['n', placement.x + placement.width / 2, placement.y],
    ['ne', placement.x + placement.width, placement.y], ['e', placement.x + placement.width, placement.y + placement.height / 2],
    ['se', placement.x + placement.width, placement.y + placement.height], ['s', placement.x + placement.width / 2, placement.y + placement.height],
    ['sw', placement.x, placement.y + placement.height], ['w', placement.x, placement.y + placement.height / 2]
  ]
  return <g aria-label="Selected widget bounds">
    <rect {...placement} fill="none" stroke="#38BDF8" strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom} ${3 / zoom}`} pointerEvents="none" />
    {points.map(([mode, cx, cy]) => <circle key={mode} cx={cx} cy={cy} r={5 / zoom} fill="#0EA5E9" stroke="#E0F2FE" strokeWidth={1.5 / zoom} className="cursor-pointer" onPointerDown={(event) => onResize(event, mode)} />)}
  </g>
}

function logicalPoint(svg: SVGSVGElement | null, clientX: number, clientY: number): { x: number; y: number } | undefined {
  if (!svg) return undefined
  const matrix = svg.getScreenCTM()
  if (!matrix) return undefined
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
  return { x: point.x, y: point.y }
}

function transformedPlacement(
  interaction: Interaction,
  dx: number,
  dy: number,
  display: DisplayDescriptor,
  snap: SnapOptions
): { placement: Placement; guides: Guides } {
  const original = interaction.placement
  if (interaction.mode === 'move') {
    const horizontal = snapAxis(original.x + dx, original.width, snap.targets.x, snap)
    const vertical = snapAxis(original.y + dy, original.height, snap.targets.y, snap)
    return {
      placement: {
        ...original,
        x: Math.round(clamp(horizontal.value, 0, display.width - original.width)),
        y: Math.round(clamp(vertical.value, 0, display.height - original.height))
      },
      guides: {
        x: horizontal.guide === undefined ? [] : [horizontal.guide],
        y: vertical.guide === undefined ? [] : [vertical.guide]
      }
    }
  }
  const minimum = 8
  // A resized edge snaps to the grid but not to another widget: a size that
  // quietly followed a neighbour would be harder to predict than to correct.
  const align = (value: number): number =>
    snap.grid > 0 ? Math.round(value / snap.grid) * snap.grid : value
  let left = original.x
  let top = original.y
  let right = original.x + original.width
  let bottom = original.y + original.height
  if (interaction.mode.includes('w')) left = clamp(align(original.x + dx), 0, right - minimum)
  if (interaction.mode.includes('e')) right = clamp(align(original.x + original.width + dx), left + minimum, display.width)
  if (interaction.mode.includes('n')) top = clamp(align(original.y + dy), 0, bottom - minimum)
  if (interaction.mode.includes('s')) bottom = clamp(align(original.y + original.height + dy), top + minimum, display.height)
  return {
    placement: { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) },
    guides: NO_GUIDES
  }
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)) }

/**
 * What the previews ask about a value. Wrapping the map keeps every renderer
 * from repeating the "read the binding, take its numeric view, resolve the
 * frame" chain, and keeps the placeholders mode from needing a second code
 * path — it simply answers "unavailable" to everything.
 */
export interface PreviewValues {
  read: (binding: string | undefined) => TelemetryValue
  /** Numeric view of what a widget's own source reads, for a fill or a sweep. */
  numberFor: (source: { binding?: string } | undefined) => number | undefined
  /** Authored style with the ramp and the rules applied, plus blink visibility. */
  styleFor: (frame: StyledFrame, authored: AuthoredStyle) => ResolvedStyle & { visible: boolean }
  /** Whether a lamp is lit on this frame, for a widget that blinks by itself. */
  blinkPhase: (blinkMs: number) => boolean
  /**
   * The samples a graph would be holding right now. The mock is a pure function
   * of the lap phase, so the trace is the real thing rather than a sketch: it is
   * the same signal evaluated at the phases that came before this one.
   */
  traceFor: (
    source: { binding?: string } | undefined,
    points: number,
    sampleIntervalMs: number
  ) => number[] | undefined
  /** Whether any value is being played at all. */
  live: boolean
}

function createPreviewValues(
  configuration: DeviceConfiguration,
  playback: PreviewPlayback,
  clockMs: number
): PreviewValues {
  const values =
    playback.mode === 'values'
      ? mockTelemetry(dashboardBindings(configuration), playback.phase)
      : new Map<string, TelemetryValue>()
  const read = (binding: string | undefined): TelemetryValue =>
    (binding ? values.get(binding) : undefined) ?? UNAVAILABLE
  return {
    read,
    numberFor: (source) => conditionValue(read(source?.binding)),
    styleFor: (frame, authored) => {
      const style = resolveWidgetStyle(frame, authored, conditionValue(read(frame.condition_source?.binding)))
      return { ...style, visible: blinkVisible(style, clockMs) }
    },
    blinkPhase: (blinkMs) => blinkMs <= 0 || clockMs % blinkMs < blinkMs / 2,
    traceFor: (source, points, sampleIntervalMs) => {
      if (playback.mode !== 'values' || !source?.binding || points < 2) return undefined
      const entry = TELEMETRY_CATALOG.find(({ name }) => name === source.binding)
      if (!entry) return undefined
      const step = sampleIntervalMs / (LAP_SECONDS * 1000)
      return Array.from({ length: points }, (_, index) =>
        conditionValue(mockValue(entry, playback.phase - (points - 1 - index) * step)) ?? 0
      )
    },
    live: playback.mode === 'values'
  }
}

/**
 * The box a widget draws its content in. LVGL positions every child against the
 * container's content area, which the border and the padding have already
 * inset, so the canvas has to inset the same way — otherwise a bordered arc is
 * drawn at its full placement here and one border narrower on the board.
 */
function contentArea(
  placement: Placement,
  border: number,
  padding: WidgetInsets | undefined
): Placement {
  const left = padding?.left ?? 0
  const top = padding?.top ?? 0
  const right = padding?.right ?? 0
  const bottom = padding?.bottom ?? 0
  return {
    x: placement.x + border + left,
    y: placement.y + border + top,
    width: Math.max(0, placement.width - 2 * border - left - right),
    height: Math.max(0, placement.height - 2 * border - top - bottom)
  }
}

/**
 * Where a widget's own fill lands. An inset background cannot be the
 * container's fill, which always reaches the border, so the device makes it a
 * child sized to leave exactly `inset` of frame showing; without an inset it is
 * the container itself and covers the whole box.
 */
function backgroundRect(
  placement: Placement,
  border: number,
  radius: number,
  inset: number
): Placement & { rx: number } {
  const edge = inset > 0 ? border + inset : 0
  return {
    x: placement.x + edge,
    y: placement.y + edge,
    width: Math.max(0, placement.width - 2 * edge),
    height: Math.max(0, placement.height - 2 * edge),
    rx: Math.max(0, radius - inset)
  }
}

/**
 * A linear gradient is two style properties on whichever object paints the
 * fill, so it is drawn as one: the authored colour is the near stop — which is
 * what a styling rule replaces — and the gradient colour is the far one.
 */
function GradientDefinition({
  id,
  from,
  to,
  direction
}: {
  id: string
  from: string
  to: string
  direction: GradientDirection | undefined
}): React.JSX.Element {
  const horizontal = direction === 'horizontal'
  return (
    <linearGradient id={id} x1="0" y1="0" x2={horizontal ? '1' : '0'} y2={horizontal ? '0' : '1'}>
      <stop offset="0%" stopColor={from} />
      <stop offset="100%" stopColor={to} />
    </linearGradient>
  )
}

/** The paint for a fill that may carry a gradient, and the definition it needs. */
function gradientPaint(
  id: string,
  color: string,
  gradientColor: string | undefined
): { paint: string; definition: boolean } {
  const far = normalizeColor(gradientColor)
  const gradient = far !== undefined && far !== 'transparent' && color !== 'transparent'
  return { paint: gradient ? `url(#${id})` : color, definition: gradient }
}

/**
 * The box every widget type carries: the fill the frame paints and the border
 * drawn inside the bounds. The device applies both from the shared frame before
 * a widget draws anything of its own, so this is drawn for every type — an arc
 * with a background used to show one on the board and nothing here.
 */
function WidgetFrameShape({
  placement,
  configuration,
  style,
  radius
}: {
  placement: Placement
  configuration: FramedWidgetConfiguration
  style: ResolvedStyle
  /** Half the shorter side for an ellipse; the authored corner otherwise. */
  radius?: number
}): React.JSX.Element {
  const gradientId = markupId(useId())
  const borderWidth = configuration.border?.width_px ?? 0
  const corner = radius ?? configuration.border?.radius_px ?? 0
  const background = normalizeColor(style.backgroundColor) ?? 'transparent'
  const box = backgroundRect(
    placement,
    borderWidth,
    corner,
    configuration.background_inset_px ?? 0
  )
  const fill = gradientPaint(gradientId, background, configuration.background_grad_color)
  return (
    <>
      {fill.definition ? (
        <GradientDefinition
          id={gradientId}
          from={background}
          to={configuration.background_grad_color as string}
          direction={configuration.background_grad_dir}
        />
      ) : null}
      {background !== 'transparent' ? <rect {...box} fill={fill.paint} /> : null}
      {borderWidth > 0 ? (
        <rect
          x={placement.x + borderWidth / 2}
          y={placement.y + borderWidth / 2}
          width={placement.width - borderWidth}
          height={placement.height - borderWidth}
          rx={Math.max(0, corner - borderWidth / 2)}
          fill="none"
          stroke={style.borderColor ?? DEFAULT_BORDER_COLOR}
          strokeWidth={borderWidth}
        />
      ) : null}
    </>
  )
}

function TextWidgetPreview({
  configuration,
  values
}: {
  configuration: TextWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const uploadedFamilies = usePreviewAssetStore((state) => state.fonts)
  const placement = completePlacement(configuration.placement)
  if (!placement) return null

  const borderWidth = configuration.border?.width_px ?? 0
  const title = configuration.title?.text ?? ''
  const titleFont = resolvedFont(configuration.title?.font, 10, uploadedFamilies)
  const valueFont = resolvedFont(configuration.value?.font, 48, uploadedFamilies)
  const content = contentArea(placement, borderWidth, configuration.padding)
  const style = values.styleFor(configuration, {
    color: configuration.value?.color ?? DEFAULT_TEXT_COLOR,
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
  const previewValue = composedText(configuration, values)

  // The device sizes the label to its text and aligns that inside the content
  // area, so the box the glyphs sit in is the string's own width by the font's
  // line height — not the widget's box. Everything below places that label the
  // way LVGL does, then draws from its baseline.
  const metrics = fontMetrics(previewValue, valueFont)
  const alignment = configuration.value?.alignment ?? 'center'
  const valueX =
    alignment === 'left'
      ? content.x
      : alignment === 'right'
        ? content.x + content.width - metrics.width
        : content.x + lvglCenterOffset(content.width, metrics.width)
  // A titled widget pushes its value down by a quarter of the caption's line
  // height, which is the room the caption takes out of the top of the box.
  const titleDrop = title ? Math.trunc(fontMetrics(title, titleFont).lineHeight / 4) : 0
  const labelTop = content.y + lvglCenterOffset(content.height, metrics.lineHeight) + titleDrop

  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      <text
        x={valueX}
        y={labelTop + metrics.ascent}
        fill={style.color ?? DEFAULT_TEXT_COLOR}
        fontFamily={valueFont.family}
        fontSize={valueFont.sizePx}
        fontWeight={valueFont.weight}
      >
        {previewValue}
      </text>
    </g>
  )
}

/**
 * The device keeps two unavailability rules apart, and so does this. A source
 * that has no value falls back to its own placeholder, so a live neighbour
 * keeps updating beside it; only when *every* source is silent does the
 * widget-level `unavailable_text` replace the whole string.
 */
function composedText(configuration: TextWidgetConfiguration, values: PreviewValues): string {
  const sources = configuration.sources ?? []
  let anyAvailable = false
  const parts = sources.map(({ binding, transform }) => {
    const body = transformedBody(transform, values.read(binding))
    if (body !== undefined) anyAvailable = true
    return withAffixes(transform, body ?? placeholderBody(transform))
  })
  if (!anyAvailable && configuration.value?.unavailable_text) {
    return configuration.value.unavailable_text
  }
  return parts.join('')
}

function BarPreview({
  configuration,
  values
}: {
  configuration: BarWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const fillGradientId = markupId(useId())
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  const style = values.styleFor(configuration, {
    color: configuration.fill_color ?? '#38BDF8',
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
  const borderWidth = configuration.border?.width_px ?? 0
  const radius = configuration.border?.radius_px ?? 0

  // The same geometry the device fills with: the bar runs between its origin
  // and its value, so a signed window with a zero origin reads from the centre.
  const inner = contentArea(placement, borderWidth, configuration.padding)
  const horizontal = (configuration.orientation ?? 'horizontal') === 'horizontal'
  const span = horizontal ? inner.width : inner.height
  const fraction = rangeFraction(values.numberFor(configuration.source), configuration.minimum, configuration.maximum)
  const originFraction = configuration.origin === undefined
    ? 0
    : rangeFraction(configuration.origin, configuration.minimum, configuration.maximum)
  const offset = Math.round(span * Math.min(originFraction, fraction))
  const length = Math.round(span * Math.max(originFraction, fraction)) - offset
  const fromAxisStart = horizontal !== (configuration.inverted ?? false)
  const leading = fromAxisStart ? offset : span - offset - length
  const fillColor = style.color ?? '#38BDF8'
  // The device runs the fill's gradient along the bar's own axis, so it reads
  // as depth on the fill rather than as a second colour crossing it.
  const fillPaint = gradientPaint(fillGradientId, fillColor, configuration.fill_grad_color)

  return (
    <g>
      {/* The frame's background is the track the fill runs over, so a bar needs
          no track colour of its own. */}
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      {fillPaint.definition ? (
        <GradientDefinition
          id={fillGradientId}
          from={fillColor}
          to={configuration.fill_grad_color as string}
          direction={horizontal ? 'horizontal' : 'vertical'}
        />
      ) : null}
      {length > 0 ? (
        <rect
          x={horizontal ? inner.x + leading : inner.x}
          y={horizontal ? inner.y : inner.y + leading}
          width={horizontal ? length : inner.width}
          height={horizontal ? inner.height : length}
          rx={Math.max(0, radius - borderWidth)}
          fill={fillPaint.paint}
        />
      ) : null}
    </g>
  )
}

function ArcPreview({
  configuration,
  values
}: {
  configuration: ArcWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  const style = values.styleFor(configuration, {
    color: configuration.fill_color ?? '#38BDF8',
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
  const thickness = configuration.thickness_px ?? 8
  const start = configuration.start_angle_deg ?? 135
  const sweep = Math.min(configuration.sweep_deg ?? 270, 360)
  // The arc object is sized to the container's content area, so the border and
  // the padding shrink the circle and move its centre.
  const plot = contentArea(placement, configuration.border?.width_px ?? 0, configuration.padding)
  const radius = Math.max(0, Math.min(plot.width, plot.height) / 2 - thickness / 2)
  const centerX = plot.x + plot.width / 2
  const centerY = plot.y + plot.height / 2
  const track = normalizeColor(configuration.track_color)
  const value = values.numberFor(configuration.source)
  const fraction = rangeFraction(value, configuration.minimum, configuration.maximum)
  // Without a value the sweep is drawn faintly at full length, so the geometry
  // can still be judged; with one it is the arc the device would sweep.
  const swept = value === undefined ? sweep : sweep * (configuration.inverted ? 1 - fraction : fraction)

  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      {track && track !== 'transparent' ? (
        <path
          d={arcPath(centerX, centerY, radius, start, sweep)}
          fill="none"
          stroke={track}
          strokeWidth={thickness}
        />
      ) : null}
      {swept > 0 ? (
        <path
          d={arcPath(centerX, centerY, radius, start, swept)}
          fill="none"
          stroke={style.color ?? '#38BDF8'}
          strokeWidth={thickness}
          strokeOpacity={value === undefined ? (track && track !== 'transparent' ? 0.25 : 0.35) : 1}
        />
      ) : null}
    </g>
  )
}

/** LVGL measures from three o'clock and grows clockwise, which SVG also does. */
function arcPath(
  centerX: number,
  centerY: number,
  radius: number,
  startDegrees: number,
  sweepDegrees: number
): string {
  const point = (degrees: number): [number, number] => {
    const radians = (degrees * Math.PI) / 180
    return [centerX + radius * Math.cos(radians), centerY + radius * Math.sin(radians)]
  }
  // A full turn has no distinct end point, so it is drawn as two half turns.
  if (sweepDegrees >= 360) {
    const [x, y] = point(startDegrees)
    const [oppositeX, oppositeY] = point(startDegrees + 180)
    return `M ${x} ${y} A ${radius} ${radius} 0 1 1 ${oppositeX} ${oppositeY} A ${radius} ${radius} 0 1 1 ${x} ${y}`
  }
  const [startX, startY] = point(startDegrees)
  const [endX, endY] = point(startDegrees + sweepDegrees)
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${sweepDegrees > 180 ? 1 : 0} 1 ${endX} ${endY}`
}

function IndicatorPreview({
  configuration,
  values
}: {
  configuration: IndicatorWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const placement = completePlacement(configuration.placement)
  const segments = configuration.segments ?? []
  if (!placement || segments.length === 0) return null
  const style = values.styleFor(configuration, {
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
  const horizontal = (configuration.orientation ?? 'horizontal') === 'horizontal'
  const gap = configuration.segment_gap_px ?? 4
  // The lamps are laid out in the container's content area, and the device
  // divides it in whole pixels — so the strip ends short of the content edge by
  // whatever the division leaves over, rather than filling it exactly.
  const strip = contentArea(placement, configuration.border?.width_px ?? 0, configuration.padding)
  const span = horizontal ? strip.width : strip.height
  const length = Math.floor((span - gap * (segments.length - 1)) / segments.length)
  if (length <= 0) return null
  const off = normalizeColor(configuration.off_color)
  const value = values.numberFor(configuration.source)
  const fraction = rangeFraction(value, configuration.minimum, configuration.maximum)
  // The device blinks every lit lamp once the value passes the blink threshold,
  // on the same clock the frame's own blink runs on.
  const blinkMs = configuration.blink_ms ?? 0
  const blinking =
    value !== undefined && blinkMs > 0 && fraction >= (configuration.blink_threshold ?? 2)
  const lampsVisible = !blinking || values.blinkPhase(blinkMs)

  const unlitPainted = off !== undefined && off !== 'transparent'

  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      {segments.map((segment, index) => {
        const offset = index * (length + gap)
        // Thresholds do not decrease, so the lit lamps are a prefix and the
        // first one not reached ends the strip.
        const lit = value !== undefined && fraction >= (segment.threshold ?? 0) && lampsVisible
        // Without an off colour the device leaves an unlit lamp fully
        // transparent, so a strip at rest is the screen behind it.
        if (!lit && !unlitPainted) return null
        return (
          <rect
            key={index}
            x={horizontal ? strip.x + offset : strip.x}
            // A vertical strip lights from the bottom up, so the first segment
            // is the lowest one.
            y={horizontal ? strip.y : strip.y + strip.height - offset - length}
            width={horizontal ? length : strip.width}
            height={horizontal ? strip.height : length}
            rx={configuration.segment_radius_px ?? 0}
            fill={lit ? (segment.color ?? '#00C853') : (off as string)}
          />
        )
      })}
    </g>
  )
}

function GraphPreview({
  configuration,
  values
}: {
  configuration: GraphWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  const style = values.styleFor(configuration, {
    color: configuration.line_color ?? '#38BDF8',
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
  const points = Math.min(configuration.point_count ?? 64, MAXIMUM_GRAPH_POINTS)
  const trace = values.traceFor(configuration.source, points, configuration.sample_interval_ms ?? 100)
  // The trace is drawn in the container's content area, and the device places
  // each point on a whole pixel: the horizontal step truncates and the vertical
  // one rounds into the plot.
  const plot = contentArea(placement, configuration.border?.width_px ?? 0, configuration.padding)
  const span = Math.max(points - 1, 1)

  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      {trace ? (
        <polyline
          points={trace
            .map((sample, index) => {
              const x = plot.x + Math.trunc((plot.width * index) / span)
              const fraction = rangeFraction(sample, configuration.minimum, configuration.maximum)
              const y = Math.round(plot.height * (1 - fraction))
              return `${x},${plot.y + clamp(y, 0, plot.height)}`
            })
            .join(' ')}
          fill="none"
          stroke={style.color ?? '#38BDF8'}
          strokeWidth={configuration.line_width_px ?? 2}
          strokeLinejoin="round"
        />
      ) : (
        <line
          x1={plot.x}
          y1={plot.y + plot.height / 2}
          x2={plot.x + plot.width}
          y2={plot.y + plot.height / 2}
          stroke={style.color ?? '#38BDF8'}
          strokeWidth={configuration.line_width_px ?? 2}
          strokeOpacity={0.35}
        />
      )}
    </g>
  )
}

/**
 * The bitmap the board holds, drawn where the board draws it: centred in the
 * content area at the size it was converted to, because the device neither
 * scales nor rotates. An image the configurator has no copy of falls back to
 * the named box, which is the layout question the canvas can still answer.
 */
function ImagePreview({
  configuration,
  values
}: {
  configuration: ImageWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const recolorId = markupId(useId())
  const bitmap = usePreviewAssetStore((state) =>
    configuration.image ? state.images[configuration.image] : undefined
  )
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  const style = values.styleFor(configuration, {
    color: configuration.recolor,
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
  const tint = normalizeColor(style.color)
  if (!bitmap) {
    return (
      <g>
        <rect
          x={placement.x}
          y={placement.y}
          width={placement.width}
          height={placement.height}
          rx={configuration.border?.radius_px ?? 0}
          fill={tint && tint !== 'transparent' ? tint : '#334155'}
          fillOpacity={tint && tint !== 'transparent' ? 0.5 : 0.35}
          stroke={style.borderColor ?? DEFAULT_BORDER_COLOR}
          strokeOpacity={0.6}
          strokeDasharray="4 3"
          strokeWidth={configuration.border?.width_px || 1}
        />
        <text
          x={placement.x + placement.width / 2}
          y={placement.y + placement.height / 2}
          fill={DEFAULT_TEXT_COLOR}
          fontFamily="Arial, sans-serif"
          fontSize={Math.max(8, Math.min(placement.height / 4, 14))}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {configuration.image || 'no image'}
        </text>
      </g>
    )
  }
  const content = contentArea(placement, configuration.border?.width_px ?? 0, configuration.padding)
  const x = content.x + lvglCenterOffset(content.width, bitmap.width)
  const y = content.y + lvglCenterOffset(content.height, bitmap.height)
  // A recolour mixes the bitmap towards one colour without touching its alpha,
  // so it is the same pixels flooded and laid back over at the configured
  // strength.
  const recolored = tint !== undefined && tint !== 'transparent'
  const recolorOpacity = (configuration.recolor_opa ?? 255) / 255
  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      <image href={bitmap.dataUrl} x={x} y={y} width={bitmap.width} height={bitmap.height} />
      {recolored ? (
        <>
          <filter id={recolorId}>
            <feFlood floodColor={tint} result="flood" />
            <feComposite in="flood" in2="SourceAlpha" operator="in" />
          </filter>
          <image
            href={bitmap.dataUrl}
            x={x}
            y={y}
            width={bitmap.width}
            height={bitmap.height}
            filter={`url(#${recolorId})`}
            opacity={recolorOpacity}
          />
        </>
      ) : null}
    </g>
  )
}

// A caption belongs to the frame, so it is drawn the same way for every type
// that has one: over a gap in the top border.
function CaptionPreview({
  configuration
}: {
  configuration: FramedWidgetConfiguration
}): React.JSX.Element | null {
  const uploadedFamilies = usePreviewAssetStore((state) => state.fonts)
  const placement = completePlacement(configuration.placement)
  const title = configuration.title?.text
  if (!placement || !title) return null
  const font = resolvedFont(configuration.title?.font, 12, uploadedFamilies)
  const metrics = fontMetrics(title, font)
  const borderWidth = configuration.border?.width_px ?? 0
  const background = normalizeColor(configuration.background_color)
  const inset = configuration.background_inset_px ?? 0
  // The caption straddles the top border: the device puts the label's top half
  // a line height above the box's edge and masks the border line behind it.
  const labelTop =
    placement.y -
    Math.trunc(metrics.lineHeight / 2) +
    (configuration.title?.offset_y_px ?? 0)
  return (
    <g>
      {borderWidth > 0 ? (
        <rect
          x={placement.x + Math.trunc((placement.width - metrics.width - 8) / 2)}
          y={placement.y}
          width={metrics.width + 8}
          height={borderWidth + 2}
          fill={background && inset === 0 ? background : SCREEN_BACKGROUND}
        />
      ) : null}
      <text
        x={placement.x + Math.trunc((placement.width - metrics.width) / 2)}
        y={labelTop + metrics.ascent}
        fill={configuration.title?.color ?? DEFAULT_TEXT_COLOR}
        fontFamily={font.family}
        fontSize={font.sizePx}
        fontWeight={font.weight}
      >
        {title}
      </text>
    </g>
  )
}

function ShapePreview({
  configuration,
  values
}: {
  configuration: ShapeWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  // A shape has no content of its own, so a rule's value colour has nowhere to
  // land — exactly as on the device, where it binds no content-colour applier.
  const style = values.styleFor(configuration, {
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
  // An ellipse is a radius of half the shorter side, which is what the device
  // gets from LV_RADIUS_CIRCLE.
  const radius =
    configuration.kind === 'ellipse'
      ? Math.min(placement.width, placement.height) / 2
      : undefined
  return (
    <g>
      <WidgetFrameShape
        placement={placement}
        configuration={configuration}
        style={style}
        radius={radius}
      />
    </g>
  )
}

interface PreviewFont {
  family: string
  sizePx: number
  weight: number
  /** Whether this is the face the board rasterizes rather than a stand-in. */
  uploaded: boolean
}

/**
 * The face to draw one font spec with. The uploaded face is used when the
 * configurator still holds the copy it installed; otherwise this falls back to
 * a system face picked to look roughly like it, and the layout it produces is
 * an approximation of the board's.
 */
function resolvedFont(
  font: FontSpec | undefined,
  defaultSizePx: number,
  uploadedFamilies: Readonly<Record<string, boolean>>
): PreviewFont {
  const identifier = font?.family ?? 'custom_font'
  const sizePx = font?.size_px ?? defaultSizePx
  if (uploadedFamilies[identifier]) {
    // The face carries its own weight; asking for a heavier one would have the
    // browser synthesize a thicker version of glyphs the board draws as they
    // are.
    return { family: previewFontFamily(identifier), sizePx, weight: 400, uploaded: true }
  }
  const black = identifier.includes('black')
  return {
    family: identifier.startsWith('roboto')
      ? 'Roboto, Arial, sans-serif'
      : 'Arial, sans-serif',
    sizePx,
    weight: black ? 900 : 600,
    uploaded: false
  }
}

function fontMetrics(text: string, font: PreviewFont): GlyphMetrics {
  return measureGlyphs(text, font.family, font.sizePx, font.weight)
}

/**
 * LVGL centres in whole pixels and truncates each half separately, so a box and
 * its contents can land one pixel off what an exact midpoint would give.
 */
function lvglCenterOffset(available: number, size: number): number {
  return Math.trunc(available / 2) - Math.trunc(size / 2)
}

function normalizeColor(color: string | undefined): string | undefined {
  return color === '#00000000' ? 'transparent' : color
}


