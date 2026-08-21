import type { DeviceConfiguration } from '@shared/device'
import { isContainer } from '@shared/configuration-access'
import {
  type WidgetSelection,
  completePlacement,
  findWidget,
  selectionTarget,
  useDashboardEditorStore
} from '../dashboard-editor'
import {
  containerClipId,
  widgetClipId,
  type InteractionMode,
  type Placement,
  type PreviewLayer
} from './canvas-geometry'
import type { PreviewValues } from './preview-values'
import { HitArea } from './CanvasOverlays'
import { WidgetBody } from './WidgetBody'

/**
 * One widget of the screen, drawn inside its container chain's clip and wired
 * for selection: a press begins a move, a double-click opens a container, and
 * the context menu acts on whatever the container rule resolves the click to.
 */
export function CanvasWidgetLayer({
  layer,
  layerIndex,
  configuration,
  placements,
  values,
  screenBackground,
  dimmed,
  gestureIdle,
  openMenu,
  beginMove
}: {
  layer: PreviewLayer
  layerIndex: number
  configuration: DeviceConfiguration
  placements: Map<string, Placement>
  values: PreviewValues
  screenBackground: string
  dimmed: boolean
  /** False while a tool, an insert, a pan or a middle-button press owns input. */
  gestureIdle: (event: React.PointerEvent) => boolean
  openMenu: (event: React.MouseEvent, widgetId?: string) => void
  beginMove: (
    event: React.PointerEvent<SVGElement>,
    target: WidgetSelection,
    mode: InteractionMode,
    placement: Placement
  ) => void
}): React.JSX.Element | null {
  const drillIn = useDashboardEditorStore((state) => state.drillIn)
  const setDrillIn = useDashboardEditorStore((state) => state.setDrillIn)
  const select = useDashboardEditorStore((state) => state.select)
  const locked = useDashboardEditorStore((state) => state.locked)
  const activeTool = useDashboardEditorStore((state) => state.activeTool)
  const id = layer.configuration.id
  // Two clips, both the device's. The widget's own box clips its contents,
  // exactly as its LVGL container does — a value wider than its widget is cut
  // off on the board rather than spilling over its neighbours — and its caption
  // is left out of that one, because the device puts the caption on the parent
  // where it overhangs the frame. The containers above it clip everything it
  // draws, caption included, which is what `clip_children` says. What is
  // deliberately *not* clipped is the hit area: a widget dragged out of a
  // container would otherwise be invisible and unselectable at once, with no
  // way back. The clip arrives in display coordinates and this group is
  // already translated by the container chain, so it is read back into local
  // space rather than the transform being undone around it. The widget's own
  // box is clipped inside WidgetBody, which knows it from the widget.
  const clip = layer.clip
    ? {
        ...layer.clip,
        x: layer.clip.x - layer.offsetX,
        y: layer.clip.y - layer.offsetY
      }
    : undefined
  return (
    <g
      opacity={dimmed ? 0.25 : undefined}
      pointerEvents={dimmed ? 'none' : undefined}
      transform={
        layer.offsetX || layer.offsetY
          ? `translate(${layer.offsetX} ${layer.offsetY})`
          : undefined
      }
      onContextMenu={(event) => {
        if (!id) return
        const target = selectionTarget(configuration, id, {
          entered: drillIn,
          deep: event.metaKey || event.ctrlKey,
          blocked: (candidate) => Boolean(locked[candidate])
        })
        if (target) openMenu(event, target)
      }}
      onPointerDown={(event) => {
        if (!id) return
        // A tool is drawing, and a press over a widget is where the author
        // wants the new one — not a request to pick what is underneath.
        if (!gestureIdle(event)) return
        // The object under the pointer is the deepest one; which widget that
        // means is the container rule, not this handler's business.
        const target = selectionTarget(configuration, id, {
          entered: drillIn,
          deep: event.metaKey || event.ctrlKey,
          blocked: (candidate) => Boolean(locked[candidate])
        })
        const placement = target ? placements.get(target) : undefined
        if (!target || !placement) return
        beginMove(event, { type: 'widget', id: target }, 'move', placement)
      }}
      // Opening a container is what makes the level below it clickable — a
      // slot one page at a time inside its own box, a shape its children.
      // Double-click is how a container has always been opened.
      onDoubleClick={() => {
        if (!id) return
        const target = selectionTarget(configuration, id, { entered: drillIn })
        const opening = target ? findWidget(configuration, target)?.widget : undefined
        if (!target || !opening || !isContainer(opening)) return
        setDrillIn(target)
        // Land on what was actually double-clicked rather than on the
        // container just opened, which is where the click was aimed.
        const inside = selectionTarget(configuration, id, { entered: target })
        if (inside && inside !== target) select({ type: 'widget', id: inside })
      }}
    >
      {clip ? (
        <clipPath id={containerClipId(layerIndex)}>
          <rect {...clip} />
        </clipPath>
      ) : null}
      <g clipPath={clip ? `url(#${containerClipId(layerIndex)})` : undefined}>
        <WidgetBody
          configuration={layer.configuration}
          values={values}
          clipId={widgetClipId(layerIndex)}
          screenBackground={screenBackground}
        />
      </g>
      {(id && locked[id]) || activeTool !== 'select' ? null : (
        <HitArea placement={completePlacement(layer.configuration.placement)} />
      )}
    </g>
  )
}
