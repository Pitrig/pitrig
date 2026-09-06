import { useMemo, useRef, useState } from 'react'
import { childArraysOf, pagesOf, screensOf, widgetsOf } from '@shared/configuration-access'
import { type DeviceConfiguration, type DisplayDescriptor } from '@shared/device'
import { GapOverlay, GridOverlay, GuideOverlay, MeasureBadge, SelectionFrame, TargetOutline } from './CanvasOverlays'
import { CanvasContextMenu } from './ContextMenu'
import { flattenScreen } from './preview-layers'
import {
  type WidgetSelection,
  absolutePlacements,
  findWidget,
  useDashboardEditorStore
} from '../dashboard-editor'
import {
  type Placement,
  type PreviewLayer,
  logicalPoint,
  marqueeBounds,
  visibleSlotPage
} from './canvas-geometry'
import { SCREEN_BACKGROUND } from './preview-theme'
import { useLiveRevision } from '@/features/telemetry/live-telemetry'
import { createLiveValues } from './preview-values'
import { resolveGridSize, useSnapStore } from '../editor/snap-store'
import { drawnBox, unionOf, type CanvasContext } from './canvas-gesture-context'
import { useCanvasGestures } from './use-canvas-gestures'
import { useCanvasInsert } from './use-canvas-insert'
import { useCanvasView } from './use-canvas-view'
import { CanvasWidgetLayer } from './CanvasWidgetLayer'
import { ClippedAwayOutlines, ContainerHints, InsertGhost, TapTargets } from './CanvasDecorations'
import { t } from '@shared/ui-text'

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
  const activeTool = useDashboardEditorStore((state) => state.activeTool)
  const setActiveTool = useDashboardEditorStore((state) => state.setActiveTool)
  const pendingInsert = useDashboardEditorStore((state) => state.pendingInsert)
  const cancelInsert = useDashboardEditorStore((state) => state.cancelInsert)
  const view = useDashboardEditorStore((state) => state.view)
  const locked = useDashboardEditorStore((state) => state.locked)
  const hidden = useDashboardEditorStore((state) => state.hidden)
  const snap = useSnapStore()
  const [menu, setMenu] = useState<{
    x: number
    y: number
    widgetId?: string
    at?: { x: number; y: number }
  }>()
  useLiveRevision()
  const values = createLiveValues()
  const placements = useMemo(() => absolutePlacements(configuration), [configuration])
  const screen = screensOf(configuration)[activeScreenIndex]
  const screenBackground = screen?.background_color ?? SCREEN_BACKGROUND
  const layers: PreviewLayer[] = flattenScreen(screen, slotPage, screenBackground)
  const gridSize = resolveGridSize(snap, display)
  const selectedPlacements = selectedIds
    .map((id) => placements.get(id))
    .filter((placement): placement is Placement => placement !== undefined)
  const primaryPlacement =
    selection?.type === 'widget' ? placements.get(selection.id) : undefined
  const groupPlacement = selectedPlacements.length > 1 ? unionOf(selectedPlacements) : undefined

  const context: CanvasContext = {
    svgRef,
    configuration,
    display,
    layers,
    placements,
    gridSize,
    snap,
    view,
    drillIn,
    locked,
    hidden,
    selection,
    selectedIds,
    select,
    extendSelection,
    selectMany,
    activeTool,
    setActiveTool
  }

  const { spaceHeld } = useCanvasView(svgRef, display)
  const { insertAt, fittedInsert, placePendingInsert, updateGhost } = useCanvasInsert(
    svgRef,
    display,
    pendingInsert,
    cancelInsert,
    select
  )
  const gestures = useCanvasGestures(context, spaceHeld, placePendingInsert, updateGhost)

  const openMenu = (event: React.MouseEvent, widgetId?: string): void => {
    event.preventDefault()
    event.stopPropagation()
    if (widgetId && !selectedIds.includes(widgetId)) select({ type: 'widget', id: widgetId })
    if (!widgetId) select({ type: 'screen' })
    setMenu({
      x: event.clientX,
      y: event.clientY,
      widgetId,
      at: logicalPoint(svgRef.current, event.clientX, event.clientY)
    })
  }

  const beginMove = (
    event: React.PointerEvent<SVGElement>,
    target: WidgetSelection,
    mode: Parameters<typeof gestures.beginInteraction>[2],
    placement: Placement
  ): void => gestures.beginInteraction(event, target, mode, placement)

  const viewWidth = display.width / view.zoom
  const viewHeight = display.height / view.zoom
  const band = gestures.marquee ? marqueeBounds(gestures.marquee) : undefined
  const drawing = gestures.draw ? drawnBox(gestures.draw.start, gestures.draw.current) : undefined
  const highlightedBoxes = gestures.feedback.highlighted
    .map((id) => placements.get(id))
    .filter((box): box is Placement => box !== undefined)

  const openedWidget = drillIn ? findWidget(configuration, drillIn)?.widget : undefined
  const isolated = openedWidget?.type === 'slot' ? drillIn : undefined
  const openedIds = new Set(
    openedWidget?.type === 'slot'
      ? (() => {
          const page = pagesOf(openedWidget)[visibleSlotPage(openedWidget, slotPage)]
          return (page ? widgetsOf(page).flatMap((widget) => [widget, ...childArraysOf(widget).flat()]) : [])
            .map((widget) => widget.id)
            .filter((id): id is string => id !== undefined)
        })()
      : []
  )
  const dimmed = (layer: PreviewLayer): boolean =>
    isolated !== undefined &&
    layer.configuration.id !== isolated &&
    !openedIds.has(layer.configuration.id ?? '')

  return (
    <>
    <svg
      ref={svgRef}
      aria-label={t('canvas.previewCanvas.dashboardDisplayPreview')}
      className={`block size-full touch-none select-none ${
        spaceHeld
          ? 'cursor-grab'
          : activeTool === 'select' && !pendingInsert
            ? ''
            : 'cursor-crosshair'
      }`}
      preserveAspectRatio="xMidYMid meet"
      viewBox={`${view.panX} ${view.panY} ${viewWidth} ${viewHeight}`}
      onPointerMove={gestures.movePointer}
      onPointerUp={gestures.finishPointer}
      onPointerCancel={gestures.finishPointer}
      onPointerDown={gestures.beginBackground}
      onContextMenu={(event) => openMenu(event)}
    >
      <rect width={display.width} height={display.height} fill={screenBackground} />
      {snap.snapToGrid ? <GridOverlay display={display} size={gridSize} zoom={view.zoom} /> : null}
      <ContainerHints
        layers={layers}
        selection={selection}
        drillIn={drillIn}
        dropContainer={gestures.dropContainer}
        zoom={view.zoom}
        dragging={Boolean(gestures.interaction || gestures.draw)}
      />
      {layers.map((layer, layerIndex) => {
        const id = layer.configuration.id
        if (id && hidden[id]) return null
        return (
          <CanvasWidgetLayer
            key={id ?? layer.configurationOrder}
            layer={layer}
            layerIndex={layerIndex}
            configuration={configuration}
            placements={placements}
            values={values}
            behind={layer.behind}
            dimmed={dimmed(layer)}
            gestureIdle={(event) =>
              activeTool === 'select' && !pendingInsert && !spaceHeld && event.button !== 1
            }
            openMenu={openMenu}
            beginMove={beginMove}
          />
        )
      })}
      <ClippedAwayOutlines layers={layers} placements={placements} hidden={hidden} zoom={view.zoom} />
      <TapTargets layers={layers} placements={placements} zoom={view.zoom} />
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
      <TargetOutline boxes={highlightedBoxes} zoom={view.zoom} />
      <GuideOverlay guides={gestures.feedback.guides} zoom={view.zoom} />
      <GapOverlay gaps={gestures.feedback.gaps} zoom={view.zoom} />
      {groupPlacement ? (
        <SelectionFrame
          placement={groupPlacement}
          zoom={view.zoom}
          group
          onResize={(event, mode) => {
            if (selection) gestures.beginInteraction(event, selection, mode, groupPlacement)
          }}
        />
      ) : selection && primaryPlacement ? (
        <SelectionFrame
          placement={primaryPlacement}
          zoom={view.zoom}
          onResize={(event, mode) =>
            gestures.beginInteraction(event, selection, mode, primaryPlacement)
          }
        />
      ) : null}
      {drawing && (drawing.width >= 1 || drawing.height >= 1) ? (
        <rect
          {...drawing}
          fill="#38F5A8"
          fillOpacity={0.1}
          stroke="#38F5A8"
          strokeWidth={1 / view.zoom}
          pointerEvents="none"
        />
      ) : null}
      {gestures.feedback.badge ? (
        <MeasureBadge
          placement={gestures.feedback.badge.placement}
          mode={gestures.feedback.badge.mode}
          display={display}
          zoom={view.zoom}
        />
      ) : null}
      {fittedInsert && insertAt ? (
        <InsertGhost fitted={fittedInsert} at={insertAt} background={screenBackground} zoom={view.zoom} />
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
    {menu ? (
      <CanvasContextMenu
        x={menu.x}
        y={menu.y}
        widgetId={menu.widgetId}
        display={display}
        at={menu.at}
        onClose={() => setMenu(undefined)}
      />
    ) : null}
    </>
  )
}
