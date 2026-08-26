import { childArraysOf, isContainer } from '@shared/configuration-access'
import { completePlacement, type WidgetSelection } from '../dashboard-editor'
import {
  actionLabel,
  intersection,
  type Placement,
  type PreviewLayer
} from './canvas-geometry'
import type { fitWidgetToDisplay } from '../editor/insert-template'
import { flattenScreen } from './preview-layers'
import { WidgetLayers } from './WidgetLayers'

export function ContainerHints({
  layers,
  selection,
  drillIn,
  dropContainer,
  zoom,
  dragging
}: {
  layers: PreviewLayer[]
  selection: WidgetSelection | undefined
  drillIn: string | undefined
  dropContainer: string | undefined
  zoom: number
  dragging: boolean
}): React.JSX.Element {
  return (
    <>
      {layers.map((layer) => {
        const widget = layer.configuration
        const empty = childArraysOf(widget).flat().length === 0
        if (widget.type !== 'slot' && empty && !(dragging && isContainer(widget))) {
          return null
        }
        const box = completePlacement(widget.placement)
        if (!box) return null
        const id = widget.id
        const picked = selection?.type === 'widget' && selection.id === id
        const landing = dropContainer !== undefined && dropContainer === id
        const stroke = widget.type === 'slot' ? '#38BDF8' : '#A78BFA'
        return (
          <rect
            key={`container-${id}`}
            x={box.x + layer.offsetX}
            y={box.y + layer.offsetY}
            width={box.width}
            height={box.height}
            fill="none"
            stroke={landing ? '#38F5A8' : picked || drillIn === id ? stroke : `${stroke}80`}
            strokeWidth={(landing ? 2 : 1) / zoom}
            strokeDasharray={landing ? undefined : `${2 / zoom} ${4 / zoom}`}
            pointerEvents="none"
          />
        )
      })}
    </>
  )
}

export function ClippedAwayOutlines({
  layers,
  placements,
  hidden,
  zoom
}: {
  layers: PreviewLayer[]
  placements: Map<string, Placement>
  hidden: Record<string, boolean>
  zoom: number
}): React.JSX.Element {
  return (
    <>
      {layers.map((layer) => {
        const id = layer.configuration.id
        const placement = id ? placements.get(id) : undefined
        if (!id || !placement || !layer.clip || hidden[id]) return null
        const visible = intersection(layer.clip, placement)
        if (visible.width > 0 && visible.height > 0) return null
        return (
          <rect
            key={`clipped-${id}`}
            {...placement}
            fill="none"
            stroke="#F59E0B"
            strokeOpacity={0.7}
            strokeWidth={1 / zoom}
            strokeDasharray={`${2 / zoom} ${3 / zoom}`}
            pointerEvents="none"
          />
        )
      })}
    </>
  )
}

export function TapTargets({
  layers,
  placements,
  zoom
}: {
  layers: PreviewLayer[]
  placements: Map<string, Placement>
  zoom: number
}): React.JSX.Element {
  const targets = layers
    .filter(
      (layer) => layer.configuration.action?.type && layer.configuration.action.type !== 'none'
    )
    .map((layer) => ({
      id: layer.configuration.id ?? '',
      placement: layer.configuration.id ? placements.get(layer.configuration.id) : undefined,
      label: actionLabel(layer.configuration.action)
    }))
    .filter(
      (entry): entry is { id: string; placement: Placement; label: string } =>
        entry.placement !== undefined
    )
  return (
    <>
      {targets.map(({ id, placement, label }) => (
        <g key={`action-${id}`} pointerEvents="none">
          <rect
            {...placement}
            fill="none"
            stroke="#38F5A8"
            strokeWidth={1 / zoom}
            strokeDasharray={`${5 / zoom} ${3 / zoom}`}
          />
          <text
            x={placement.x + 2 / zoom}
            y={placement.y + 10 / zoom}
            fill="#38F5A8"
            fontSize={9 / zoom}
          >
            {label}
          </text>
        </g>
      ))}
    </>
  )
}

export function InsertGhost({
  fitted,
  at,
  background,
  zoom
}: {
  fitted: NonNullable<ReturnType<typeof fitWidgetToDisplay>>
  at: { x: number; y: number }
  background: string
  zoom: number
}): React.JSX.Element {
  const box = completePlacement(fitted.widget.placement)
  return (
    <g
      opacity={0.6}
      pointerEvents="none"
      transform={`translate(${Math.round(at.x - fitted.width / 2) - (box?.x ?? 0)} ${Math.round(at.y - fitted.height / 2) - (box?.y ?? 0)})`}
    >
      <WidgetLayers layers={flattenScreen({ widgets: [fitted.widget] }, {})} background={background} />
      <rect
        {...(box ?? { x: 0, y: 0, width: 0, height: 0 })}
        fill="none"
        stroke="#38BDF8"
        strokeDasharray={`${4 / zoom} ${3 / zoom}`}
        strokeWidth={1 / zoom}
      />
    </g>
  )
}
