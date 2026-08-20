import { childArraysOf, pagesOf, stackOrder, type WidgetParent } from '@shared/configuration-access'
import { MAXIMUM_NESTING_DEPTH, MAXIMUM_WIDGETS_PER_CONTAINER, MAXIMUM_WIDGETS_PER_SCREEN, type WidgetConfiguration } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import type { WidgetPlacement } from '@shared/configuration-schema'
import { absolutePlacement, ancestorsOf, findWidget, mutateDraftConfiguration, parentOf, parentOffset, writePlacement } from './document'
import { visibleSlotPage } from '../preview/canvas-geometry'
import { useDashboardEditorStore } from './store'
import { useDeviceStore } from '@/features/device/device-store'

// Moving a widget somewhere else in the tree: which parent it lands in, at what
// depth, whether the destination can hold it, and what its geometry becomes
// once its origin changes. The densest logic in the editor, and the reason the
// layer panel's drag and drop is only a few lines.

/** Where a dropped widget lands relative to the row it was dropped on. */
export type DropRelation = 'above' | 'below' | 'inside'

/**
 * Where a move puts the widget. The layer panel always names a row, because
 * that is what it drops onto; the canvas names a container or, when the widget
 * was dragged clear of every one of them, the screen it belongs to. Three
 * spellings of one question — which array, and at what index — so they resolve
 * into one plan rather than into three commands.
 */
type MoveDestination =
  | { kind: 'beside'; relation: 'above' | 'below'; targetId: string }
  | { kind: 'inside'; containerId: string; page?: number }
  | { kind: 'screen'; index: number }

function destinationOf(relation: DropRelation, targetId: string): MoveDestination {
  return relation === 'inside'
    ? { kind: 'inside', containerId: targetId }
    : { kind: 'beside', relation, targetId }
}

interface MovePlan {
  widget: WidgetConfiguration
  sourceOwner: WidgetParent
  destinationOwner: WidgetParent
  /** The destination's children back to front, with the widget already in place. */
  order: WidgetConfiguration[]
  /** The widget's box on the display before the move, so it can stay put. */
  absolute?: Required<WidgetPlacement>
  /** Where the destination measures its children from. */
  origin: { x: number; y: number }
  /** False when nothing would be drawn differently, which is not worth an undo step. */
  changed: boolean
}

/** Levels of container this widget adds below the array it is placed in, or undefined for a leaf. */
function containerHeight(widget: WidgetConfiguration): number | undefined {
  const arrays = childArraysOf(widget)
  if (arrays.length === 0) return undefined
  const below = arrays
    .flat()
    .map(containerHeight)
    .filter((level): level is number => level !== undefined)
  // A slot's pages cost no level, so a slot is exactly as tall as a shape
  // holding the same widgets.
  return below.length === 0 ? 0 : 1 + Math.max(...below)
}

/** Where a destination measures its children from: the container's own corner, or the screen. */
function destinationOrigin(
  configuration: DeviceConfiguration,
  containerId: string | undefined
): { x: number; y: number } {
  if (!containerId) return { x: 0, y: 0 }
  const box = absolutePlacement(configuration, containerId)
  // An unreadable box is the case parentOffset already tolerates, so tolerate it
  // the same way rather than refusing a move over a widget nobody can see.
  return box ? { x: box.x, y: box.y } : parentOffset(configuration, containerId)
}

/**
 * What a drop would do, or undefined when it may not happen. Pure, and resolved
 * against the configuration it is handed: the predicate the panel asks and the
 * command that acts are the same function, so they cannot disagree, and running
 * it again on the draft's clone means no path arithmetic survives a splice.
 */
function planMove(
  configuration: DeviceConfiguration | undefined,
  id: string,
  destination: MoveDestination
): MovePlan | undefined {
  if (!configuration) return undefined
  const moved = findWidget(configuration, id)
  if (!moved) return undefined
  const anchorId =
    destination.kind === 'screen'
      ? undefined
      : destination.kind === 'inside'
        ? destination.containerId
        : destination.targetId
  if (anchorId === id) return undefined
  const target = anchorId === undefined ? undefined : findWidget(configuration, anchorId)
  if (anchorId !== undefined && !target) return undefined
  // Dropping beside a descendant is the same containment error as dropping
  // inside one, so one test covers both relations.
  if (target && ancestorsOf(configuration, target).some((ancestor) => ancestor.id === id)) {
    return undefined
  }
  const into = destination.kind === 'inside' ? target?.widget : undefined
  if (into !== undefined && into.type !== 'shape' && into.type !== 'slot') return undefined
  // A slot holds nothing directly, so dropping into one means dropping onto one
  // of its pages. The layer list names the page it dropped on; everywhere else
  // it is the page being looked at, because the page tabs are already where the
  // author says which one they mean.
  const intoPage =
    into?.type !== 'slot'
      ? undefined
      : destination.kind === 'inside' && destination.page !== undefined
        ? destination.page
        : visibleSlotPage(into, useDashboardEditorStore.getState().slotPage)

  const sourceOwner = parentOf(configuration, moved)
  const destinationOwner =
    destination.kind === 'screen'
      ? configuration.dashboard?.screens?.[destination.index]
      : into === undefined
        ? target && parentOf(configuration, target)
        : into.type === 'slot'
          ? pagesOf(into)[intoPage ?? 0]
          : into
  if (!sourceOwner || !destinationOwner) return undefined
  const sameParent = sourceOwner === destinationOwner

  // The depth the validator walks the destination array at, mirroring its own
  // walk: a container's array is one deeper than the array the container sits
  // in, and a slot page is one deeper again.
  // Counted from the container chain rather than from the path, because a path
  // carries an extra entry for a slot page and a page costs no level. One
  // ancestor is one level, whether it is a shape or a slot.
  const depth =
    target === undefined
      ? 0
      : ancestorsOf(configuration, target).length + (into === undefined ? 0 : 1)
  if (!sameParent) {
    // A slot is built before every container that could hold one, so it is only
    // ever authored on a screen.
    if (moved.widget.type === 'slot' && depth > 0) return undefined
    // What has to fit is the subtree's own tallest container, not just the
    // widget: a container of containers dropped two deep pushes its own past the
    // cap even though the widget itself would fit.
    const height = containerHeight(moved.widget)
    if (height !== undefined && depth + height + 2 > MAXIMUM_NESTING_DEPTH) return undefined
    const capacity = depth === 0 ? MAXIMUM_WIDGETS_PER_SCREEN : MAXIMUM_WIDGETS_PER_CONTAINER
    if ((destinationOwner.widgets?.length ?? 0) >= capacity) return undefined
  }

  const stack = stackOrder(destinationOwner.widgets).map(({ widget }) => widget)
  const rest = stack.filter((widget) => widget !== moved.widget)
  // The panel lists a stack top first while this sequence is back to front, so
  // "above the target" is the position *after* it. Landing in a container or on
  // a screen takes the back of back-to-front, which is the top of that stack —
  // a widget just dropped somewhere should be visible there, not buried under
  // what was already in it.
  let at = rest.length
  if (destination.kind === 'beside') {
    const beside = rest.indexOf(target?.widget as WidgetConfiguration)
    if (beside < 0) return undefined
    at = beside + (destination.relation === 'above' ? 1 : 0)
  }
  const order = [...rest.slice(0, at), moved.widget, ...rest.slice(at)]

  return {
    widget: moved.widget,
    sourceOwner,
    destinationOwner,
    order,
    absolute: absolutePlacement(configuration, id),
    origin: destinationOrigin(
      configuration,
      destination.kind === 'screen'
        ? undefined
        : into !== undefined
          ? target?.widget.id
          : target && ancestorsOf(configuration, target).at(-1)?.id
    ),
    changed:
      !sameParent || order.some((widget, index) => widget !== stack[index])
  }
}

/**
 * Splices the move into the document. Widgets are addressed by object identity
 * rather than by a path captured earlier, so the order the arrays are spliced in
 * cannot invalidate the plan.
 */
function applyMove(plan: MovePlan): void {
  const source = plan.sourceOwner.widgets
  const at = source?.indexOf(plan.widget) ?? -1
  if (!source || at < 0) return
  source.splice(at, 1)
  // Absolute before, minus where the destination measures from: the widget keeps
  // the place on the display it was dragged from.
  if (plan.absolute) writePlacement(plan.widget, plan.absolute, plan.origin)
  const destination = (plan.destinationOwner.widgets ??= [])
  destination.splice(0, destination.length, ...plan.order)
  // Writing every index rather than only the moved one keeps the stack readable
  // in the JSON editor, leaves no ties for the authored order to break, and
  // keeps array order and z_index agreeing — which every later drop relies on.
  plan.order.forEach((widget, index) => {
    widget.z_index = index
  })
  // An emptied array is dropped rather than left as `[]`, as deleteWidget does.
  // A same-parent move put the widget back into this very array, so it is never
  // empty on that path.
  if (source.length === 0) delete plan.sourceOwner.widgets
}

/** Whether a drop into this container — or onto that page of it — may happen. */
export function canMoveWidgetInto(id: string, containerId: string, page?: number): boolean {
  return (
    planMove(useDeviceStore.getState().draft, id, { kind: 'inside', containerId, page }) !==
    undefined
  )
}

/** Whether the panel should offer this drop at all, and light up the band for it. */
export function canMoveWidget(id: string, relation: DropRelation, targetId: string): boolean {
  return (
    planMove(useDeviceStore.getState().draft, id, destinationOf(relation, targetId)) !==
    undefined
  )
}

/**
 * Moves one widget to another place in the tree, into a container or beside a
 * sibling, keeping it where it looks on the display.
 *
 * The guards run before the mutation rather than inside it, because setDraft
 * records history unconditionally: a refusal inside the closure would still push
 * an undo entry and throw away the redo branch.
 */
export function moveWidget(id: string, relation: DropRelation, targetId: string): boolean {
  return runMove(id, destinationOf(relation, targetId))
}

/**
 * Moves a widget into a container, or back onto its own screen when given none.
 * This is what a drag on the canvas ends in: the geometry is already where the
 * author put it, so the move only changes which array holds the widget and
 * which box its coordinates are read against.
 */
export function moveWidgetInto(
  id: string,
  containerId: string | undefined,
  page?: number
): boolean {
  if (containerId !== undefined) return runMove(id, { kind: 'inside', containerId, page })
  // Its own screen rather than the one being edited: they are the same screen
  // in every path that reaches here, and reading it from the widget cannot put
  // it somewhere it was never on.
  const screen = findWidget(useDeviceStore.getState().draft, id)?.screenIndex
  return screen === undefined ? false : runMove(id, { kind: 'screen', index: screen })
}

function runMove(id: string, destination: MoveDestination): boolean {
  if (!planMove(useDeviceStore.getState().draft, id, destination)?.changed) return false
  const reveal: { slot: string; page: number }[] = []
  mutateDraftConfiguration((configuration) => {
    const plan = planMove(configuration, id, destination)
    if (!plan) return
    applyMove(plan)
    const landed = findWidget(configuration, id)
    if (!landed) return
    // A path entry per ancestor, and one more after a slot for the page it
    // holds the widget on — so the cursor is walked rather than derived.
    let cursor = 0
    for (const ancestor of ancestorsOf(configuration, landed)) {
      cursor += 1
      if (ancestor.type !== 'slot') continue
      if (ancestor.id) reveal.push({ slot: ancestor.id, page: landed.path[cursor] ?? 0 })
      cursor += 1
    }
  })
  // A page the tabs are not looking at is not drawn, so a widget dropped onto one
  // would vanish on release and read as a delete.
  for (const { slot, page } of reveal) {
    useDashboardEditorStore.getState().setSlotPage(slot, page)
  }
  return true
}
