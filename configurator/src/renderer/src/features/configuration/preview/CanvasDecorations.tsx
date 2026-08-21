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

// The inert decorations the canvas draws around the widgets: container hints,
// clipped-away markers, tap-target outlines and the insert ghost. All of them
// are pointerEvents="none" fragments — nothing here handles input.

/**
 * A container is a visible widget with its own hit area, so all it needs here
 * is a hint that it holds things — drawn under the widgets, and only on the
 * outline so it never steals a click from a child. A slot draws nothing at
 * all, so its outline is not a hint but the only thing that says where it is;
 * and every container gets one while something is being dragged, because an
 * empty shape is otherwise an invisible place to drop into.
 */
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
            // Solid says the drop lands here; dashed is only a hint that
            // something holds widgets.
            strokeDasharray={landing ? undefined : `${2 / zoom} ${4 / zoom}`}
            pointerEvents="none"
          />
        )
      })}
    </>
  )
}

/**
 * A widget its container cuts away entirely draws nothing, here and on the
 * board. Nothing is not something an author can select or drag back, so the
 * editor says where it went — the hit area under this outline is live, which
 * is what makes it recoverable.
 */
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

/**
 * A tap target is only a tap target on the board, so the canvas says so: an
 * empty transparent shape would otherwise be an invisible rectangle.
 */
export function TapTargets({
  layers,
  placements,
  zoom
}: {
  layers: PreviewLayer[]
  placements: Map<string, Placement>
  zoom: number
}): React.JSX.Element {
  // Every tap target is a widget now — a container carries its action on the
  // frame like any other — so one pass collects them all in display coordinates.
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

/**
 * What the click will put down, drawn where it will land. Inert, so the press
 * underneath it still reaches the surface. Flattened, so a container being
 * placed shows what is inside it rather than an empty box.
 */
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
