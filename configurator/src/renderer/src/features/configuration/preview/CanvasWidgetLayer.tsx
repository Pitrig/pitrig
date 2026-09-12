import { memo } from 'react'

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

export const CanvasWidgetLayer = memo(function CanvasWidgetLayer({
  layer,
  layerIndex,
  configuration,
  placements,
  values,
  behind,
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
  behind: string
  dimmed: boolean
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
        if (!gestureIdle(event)) return
        const target = selectionTarget(configuration, id, {
          entered: drillIn,
          deep: event.metaKey || event.ctrlKey,
          blocked: (candidate) => Boolean(locked[candidate])
        })
        const placement = target ? placements.get(target) : undefined
        if (!target || !placement) return
        beginMove(event, { type: 'widget', id: target }, 'move', placement)
      }}
      onDoubleClick={() => {
        if (!id) return
        const target = selectionTarget(configuration, id, { entered: drillIn })
        const opening = target ? findWidget(configuration, target)?.widget : undefined
        if (!target || !opening || !isContainer(opening)) return
        setDrillIn(target)
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
          behind={behind}
        />
      </g>
      {(id && locked[id]) || activeTool !== 'select' ? null : (
        <HitArea placement={completePlacement(layer.configuration.placement)} />
      )}
    </g>
  )
})
