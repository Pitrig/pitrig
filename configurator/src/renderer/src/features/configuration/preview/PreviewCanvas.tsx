import { useEffect, useRef, useState } from 'react'
import { childArraysOf, pagesOf, screensOf, widgetsOf } from '@shared/configuration-access'
import { type DeviceConfiguration, type DisplayDescriptor } from '@shared/device'
import { LAP_SECONDS } from '@shared/mock-telemetry'
import { clamp } from '../editor/placement'
import { GridOverlay, GuideOverlay, HitArea, SelectionFrame } from './CanvasOverlays'
import { ImagePreview } from './ImagePreview'
import { TextWidgetPreview } from './TextPreview'
import { moveSelection } from '../editor/geometry-commands'
import { flattenScreen } from './preview-layers'
import { MAXIMUM_ZOOM, MINIMUM_ZOOM, type WidgetSelection, absolutePlacement, completePlacement, findWidget, useDashboardEditorStore } from '../dashboard-editor'
import { type Follower, type Guides, type Interaction, type InteractionMode, type Marquee, NO_GUIDES, PREVIEW_TICK_MS, type Pan, type Placement, type PreviewLayer, SNAP_TOLERANCE_PX, type SnapTargets, actionLabel, clampPan, collectSnapTargets, intersects, logicalPoint, marqueeBounds, transformedPlacement, viewportScale, visibleSlotPage, widgetClipId } from './canvas-geometry'
import { ArcPreview, BarPreview, GraphPreview, IndicatorPreview } from './gauge-previews'
import { SCREEN_BACKGROUND } from './preview-theme'
import { createPreviewValues } from './preview-values'
import { CaptionPreview, ShapePreview, } from './widget-previews'
import { useDeviceStore } from '@/features/device/device-store'

export function Widgets({
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
  const slotPage = useDashboardEditorStore((state) => state.slotPage)
  const drillIn = useDashboardEditorStore((state) => state.drillIn)
  const setDrillIn = useDashboardEditorStore((state) => state.setDrillIn)
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
  const layers: PreviewLayer[] = flattenScreen(screen, slotPage)
  // What the canvas is actually showing, which is what a marquee may catch and
  // what a drag may snap to: a widget on a page nobody is looking at is not on
  // screen, so treating it as a target would select and align the invisible.
  const widgets = layers.map((layer) => layer.configuration)
  const selectedPlacements = selectedIds
    .map((id) => absolutePlacement(configuration, id))
    .filter((placement): placement is Placement => placement !== undefined)
  // A container resizes like the widget it is: its box is the thing being
  // dragged, and its children keep the offsets they were authored with.
  const primaryPlacement =
    selection?.type === 'widget' ? absolutePlacement(configuration, selection.id) : undefined

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
      moveSelection(
        interaction.target.type === 'widget' ? interaction.target.id : '',
        resolved.placement,
        { x: shiftX, y: shiftY },
        interaction.followers,
        display
      )
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

  // Every tap target is a widget now — a container carries its action on the
  // frame like any other — so one pass collects them all in display coordinates.
  const tapTargets = layers
      .filter((layer) => layer.configuration.action?.type && layer.configuration.action.type !== 'none')
      .map((layer) => ({
        id: layer.configuration.id ?? '',
        placement: layer.configuration.id
          ? absolutePlacement(configuration, layer.configuration.id)
          : undefined,
        label: actionLabel(layer.configuration.action)
      }))
  .filter(
    (entry): entry is { id: string; placement: Placement; label: string } =>
      entry.placement !== undefined
  )

  const viewWidth = display.width / view.zoom
  const viewHeight = display.height / view.zoom
  const band = marquee ? marqueeBounds(marquee) : undefined

  // Working inside a slot means looking at its box, with the rest of the screen
  // still drawn around it for context but dimmed and inert — the page is the
  // only thing being authored, and a click landing outside it would be an edit
  // to something the author is not looking at.
  const opened = drillIn ? absolutePlacement(configuration, drillIn) : undefined
  const openedIds = new Set(
    drillIn
      ? (() => {
          const slot = findWidget(configuration, drillIn)?.widget
          if (slot?.type !== 'slot') return []
          const page = pagesOf(slot)[visibleSlotPage(slot, slotPage)]
          return (page ? widgetsOf(page).flatMap((widget) => [widget, ...childArraysOf(widget).flat()]) : [])
            .map((widget) => widget.id)
            .filter((id): id is string => id !== undefined)
        })()
      : []
  )
  const dimmed = (layer: PreviewLayer): boolean =>
    opened !== undefined &&
    layer.configuration.id !== drillIn &&
    !openedIds.has(layer.configuration.id ?? '')

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
      {/* A container is a visible widget with its own hit area, so all it needs
          here is a hint that it holds things — drawn under the widgets, and
          only on the outline so it never steals a click from a child. Reaching
          a full container is Escape, which walks up from whatever child was
          clicked; a child is drawn above its parent, so there is no point on it
          that a click could otherwise land on. */}
      {layers.map((layer) => {
        const widget = layer.configuration
        // A slot draws nothing at all, so its outline is not a hint but the only
        // thing that says where it is — an empty one still gets it.
        if (widget.type !== 'slot' && childArraysOf(widget).flat().length === 0) return null
        const box = completePlacement(widget.placement)
        if (!box) return null
        const id = widget.id
        const picked = selection?.type === 'widget' && selection.id === id
        const stroke = widget.type === 'slot' ? '#38BDF8' : '#A78BFA'
        return (
          <rect
            key={`container-${id}`}
            x={box.x + layer.offsetX}
            y={box.y + layer.offsetY}
            width={box.width}
            height={box.height}
            fill="none"
            stroke={picked || drillIn === id ? stroke : `${stroke}80`}
            strokeWidth={1 / view.zoom}
            strokeDasharray={`${2 / view.zoom} ${4 / view.zoom}`}
            pointerEvents="none"
          />
        )
      })}
      {layers.map((layer, layerIndex) => {
        const id = layer.configuration.id
        if (id && hidden[id]) return null
        // The widget's own box clips its contents, exactly as its LVGL
        // container does — a value wider than its widget is cut off on the
        // board rather than spilling over its neighbours. The caption is left
        // out of it because the device puts it on the parent, so it may
        // overhang the frame. Nothing clips a widget to its container: the
        // device stopped doing that too, which is what lets a caption or an
        // overhanging readout be drawn at all.
        const box = completePlacement(layer.configuration.placement)
        const faded = dimmed(layer)
        return (
          <g
            key={id ?? layer.configurationOrder}
            opacity={faded ? 0.25 : undefined}
            pointerEvents={faded ? 'none' : undefined}
            transform={
              layer.offsetX || layer.offsetY
                ? `translate(${layer.offsetX} ${layer.offsetY})`
                : undefined
            }
            onPointerDown={(event) => {
            const placement = id ? absolutePlacement(configuration, id) : undefined
            if (!placement || !id || locked[id]) return
            beginInteraction(event, { type: 'widget', id }, 'move', placement)
          }}
            // A slot is authored one page at a time inside its own box, which is
            // what opening it means — and double-click is how a container has
            // always been opened.
            onDoubleClick={
              layer.configuration.type === 'slot' && id
                ? () => setDrillIn(id)
                : undefined
            }>
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
              ) : layer.configuration.type === 'slot' ? null : (
                <TextWidgetPreview configuration={layer.configuration} values={values} />
              )}
            </g>
            {layer.configuration.type === 'slot' ? null : (
              <CaptionPreview configuration={layer.configuration} behind={screenBackground} />
            )}
            {id && locked[id] ? null : (
              <HitArea placement={completePlacement(layer.configuration.placement)} />
            )}
          </g>
        )
      })}
      {/* A tap target is only a tap target on the board, so the canvas says so:
          an empty transparent shape would otherwise be an invisible rectangle. */}
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
