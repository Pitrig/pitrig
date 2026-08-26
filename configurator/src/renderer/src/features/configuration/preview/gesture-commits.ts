import { moveSelection, scaleWidgets } from '../editor/geometry-commands'
import { type Draw, type Interaction, containerAt, intersects } from './canvas-geometry'
import { absolutePlacement, moveWidgetInto, parentContainerId } from '../dashboard-editor'
import { useDeviceStore } from '@/features/device/device-store'
import { useSnapStore } from '../editor/snap-store'
import { resolveMove, resolveResize } from './snapping'
import { createWidget, defaultToolBox } from './widget-creation'
import {
  type CanvasContext,
  type Feedback,
  type Modifiers,
  MINIMUM_DRAWN_PX,
  drawnBox
} from './canvas-gesture-context'
import { dropTargetFor, excludedFrom, preferences, snapField } from './gesture-fields'

export function commitMove(
  context: CanvasContext,
  gesture: Interaction,
  dx: number,
  dy: number,
  modifiers: Modifiers,
  setFeedback: (feedback: Feedback) => void,
  setDropContainer: (id: string | undefined) => void
): void {
  const movedId = gesture.target.type === 'widget' ? gesture.target.id : ''
  const excluded = excludedFrom(movedId, gesture.followers)
  const keeping = modifiers.metaKey || modifiers.ctrlKey
  const loose = {
    ...gesture.placement,
    x: gesture.placement.x + dx,
    y: gesture.placement.y + dy
  }
  const inside =
    keeping || gesture.followers.length > 0
      ? gesture.level
      : dropTargetFor(context, loose, excluded, gesture.followers.length)
  const parentBox = gesture.level === undefined ? undefined : context.placements.get(gesture.level)
  const overhangs =
    inside === undefined && parentBox !== undefined && intersects(loose, parentBox)
  const level = keeping || overhangs ? gesture.level : inside
  const resolved = resolveMove(
    gesture.placement,
    dx,
    dy,
    snapField(context, level, excluded),
    context.display,
    preferences(context, modifiers)
  )
  setFeedback({
    guides: resolved.guides,
    gaps: resolved.gaps,
    highlighted: resolved.highlighted,
    badge: { placement: resolved.placement, mode: 'move' }
  })
  setDropContainer(level === gesture.level ? undefined : level)
  moveSelection(
    movedId,
    resolved.placement,
    {
      x: resolved.placement.x - gesture.placement.x,
      y: resolved.placement.y - gesture.placement.y
    },
    gesture.followers,
    context.display
  )
}

export function commitResize(
  context: CanvasContext,
  gesture: Interaction,
  dx: number,
  dy: number,
  modifiers: Modifiers,
  setFeedback: (feedback: Feedback) => void
): void {
  if (gesture.mode === 'move') return
  const excluded = new Set(gesture.subjects.map((subject) => subject.id))
  const resolved = resolveResize(
    gesture.placement,
    gesture.mode,
    dx,
    dy,
    snapField(context, gesture.level, excluded),
    context.display,
    preferences(context, modifiers),
    { proportional: modifiers.shiftKey, fromCenter: modifiers.altKey }
  )
  setFeedback({
    guides: resolved.guides,
    gaps: resolved.gaps,
    highlighted: resolved.highlighted,
    badge: { placement: resolved.placement, mode: 'resize' }
  })
  scaleWidgets(
    gesture.subjects,
    gesture.placement,
    resolved.placement,
    context.display,
    useSnapStore.getState().scaleContents
  )
}

export function drawLevel(context: CanvasContext, pending: Draw): string | undefined {
  const box = drawnBox(pending.start, pending.current)
  if (box.width < 1 || box.height < 1) return context.drillIn
  return containerAt(context.layers, context.placements, box, new Set(), context.locked, context.hidden)
}

export function finishDraw(context: CanvasContext, pending: Draw): void {
  const box = drawnBox(pending.start, pending.current)
  const drawn =
    box.width >= MINIMUM_DRAWN_PX && box.height >= MINIMUM_DRAWN_PX
      ? box
      : defaultToolBox(pending.tool, pending.start, context.display)
  const into =
    containerAt(context.layers, context.placements, drawn, new Set(), context.locked, context.hidden) ?? 'screen'
  const added = createWidget(pending.tool, context.display, { placement: drawn, into })
  if (added) context.select(added)
  context.setActiveTool('select')
}

export function settleDropAfterMove(
  context: CanvasContext,
  interaction: Interaction,
  event: { metaKey: boolean; ctrlKey: boolean }
): void {
  if (interaction.mode !== 'move' || interaction.target.type !== 'widget') return
  if (event.metaKey || event.ctrlKey) return
  const moved = interaction.target.id
  const draft = useDeviceStore.getState().draft
  const box = absolutePlacement(draft, moved)
  const landing = dropTargetFor(
    context,
    box,
    excludedFrom(moved, interaction.followers),
    interaction.followers.length
  )
  const parent = parentContainerId(draft, interaction.target)
  const parentBox = parent === undefined ? undefined : absolutePlacement(draft, parent)
  const overhangs =
    landing === undefined && box !== undefined && parentBox !== undefined &&
    intersects(box, parentBox)
  if (!overhangs && landing !== parent) {
    moveWidgetInto(moved, landing)
  }
}
