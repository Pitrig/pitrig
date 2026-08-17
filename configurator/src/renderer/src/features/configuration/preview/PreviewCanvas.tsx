import { useEffect, useRef, useState } from 'react'
import { groupsOf, screensOf, widgetsOf } from '../../../../../shared/configuration-access'
import { type DeviceConfiguration, type DisplayDescriptor } from '../../../../../shared/device'
import { LAP_SECONDS } from '../../../../../shared/mock-telemetry'
import { MAXIMUM_ZOOM, MINIMUM_ZOOM, type WidgetSelection, absolutePlacement, completePlacement, findGroup, findWidget, mutateDraftConfiguration, parentOffset, useDashboardEditorStore } from '../dashboard-editor'
import { type Follower, GROUP_GRAB_PX, type Guides, type Interaction, type InteractionMode, type Marquee, NO_GUIDES, PREVIEW_TICK_MS, type Pan, type Placement, type PreviewLayer, type ResizeMode, SNAP_TOLERANCE_PX, type ScreenEntry, type SnapTargets, actionLabel, clamp, clampPan, collectSnapTargets, groupClipId, intersects, logicalPoint, marqueeBounds, transformedPlacement, viewportScale, visibleInSlot, widgetClipId } from './canvas-geometry'
import { ArcPreview, BarPreview, GraphPreview, IndicatorPreview } from './gauge-previews'
import { SCREEN_BACKGROUND } from './preview-theme'
import { createPreviewValues } from './preview-values'
import { CaptionPreview, ImagePreview, ShapePreview, TextWidgetPreview } from './widget-previews'
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
            <CaptionPreview configuration={layer.configuration} behind={screenBackground} />
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
