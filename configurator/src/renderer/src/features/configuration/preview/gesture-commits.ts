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

// What a gesture writes into the document as the pointer moves, and how a
// drawn box becomes a widget on release. Extracted from the gesture hook so
// the hook holds only pointer state; each of these is one frame's commit.

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
  // ⌘/Ctrl means "ignore the containers" here as it does for selection, so
  // a widget can be parked over a plate without joining it.
  const keeping = modifiers.metaKey || modifiers.ctrlKey
  // Where the box is before anything snaps decides which container it is in,
  // and that container decides what it snaps to: the level answers on the
  // way in, so a widget dragged into a panel lines up with the panel's own
  // contents from the moment it is over them.
  const loose = {
    ...gesture.placement,
    x: gesture.placement.x + dx,
    y: gesture.placement.y + dy
  }
  // A group drag never reparents — moving only the widget under the pointer
  // would split the selection across two boxes — so it also never changes the
  // level it lines up within.
  const inside =
    keeping || gesture.followers.length > 0
      ? gesture.level
      : dropTargetFor(context, loose, excluded, gesture.followers.length)
  // Overhanging is not leaving — the same rule the release applies, so what
  // the drag lines up with is what the drop will land in.
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

/** The level a drawn box belongs to, which is where its corners line up. */
export function drawLevel(context: CanvasContext, pending: Draw): string | undefined {
  const box = drawnBox(pending.start, pending.current)
  if (box.width < 1 || box.height < 1) return context.drillIn
  return containerAt(context.layers, context.placements, box, new Set(), context.locked, context.hidden)
}

export function finishDraw(context: CanvasContext, pending: Draw): void {
  const box = drawnBox(pending.start, pending.current)
  // A click rather than a drag is still a request for a widget: the kind's
  // own size, centred where the pointer went down.
  const drawn =
    box.width >= MINIMUM_DRAWN_PX && box.height >= MINIMUM_DRAWN_PX
      ? box
      : defaultToolBox(pending.tool, pending.start, context.display)
  const into =
    containerAt(context.layers, context.placements, drawn, new Set(), context.locked, context.hidden) ?? 'screen'
  const added = createWidget(pending.tool, context.display, { placement: drawn, into })
  if (added) context.select(added)
  // One-shot: the tool has done what it was picked for.
  context.setActiveTool('select')
}

/**
 * Where the widget ended up decides what holds it: the innermost container
 * that contains it whole, or its screen when none does. Resolved from the
 * committed document rather than from the highlight, which is a render behind,
 * and run before endEdit so the move and the drag are one undo.
 */
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
  // Overhanging is not leaving. A widget that still touches its container was
  // nudged past its edge — which is exactly what `clip_children: false` is
  // authored for — so it keeps its parent; only one dragged clear of the
  // container altogether is released onto the screen.
  const overhangs =
    landing === undefined && box !== undefined && parentBox !== undefined &&
    intersects(box, parentBox)
  // Same parent is not a move either: dropping a widget back where it came
  // from would otherwise raise it to the top of its own container's stack.
  if (!overhangs && landing !== parent) {
    moveWidgetInto(moved, landing)
  }
}
