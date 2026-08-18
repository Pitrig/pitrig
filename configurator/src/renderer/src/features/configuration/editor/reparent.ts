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
  relation: DropRelation,
  targetId: string
): MovePlan | undefined {
  if (!configuration || id === targetId) return undefined
  const moved = findWidget(configuration, id)
  const target = findWidget(configuration, targetId)
  if (!moved || !target) return undefined
  // Dropping beside a descendant is the same containment error as dropping
  // inside one, so one test covers both relations.
  if (ancestorsOf(configuration, target).some((ancestor) => ancestor.id === id)) return undefined
  const into = relation === 'inside' ? target.widget : undefined
  if (into !== undefined && into.type !== 'shape' && into.type !== 'slot') return undefined
  // Dropping into a slot means dropping onto the page being looked at: a slot
  // holds nothing directly, and the page tabs are already where the author says
  // which one they mean.
  const intoPage =
    into?.type === 'slot'
      ? visibleSlotPage(into, useDashboardEditorStore.getState().slotPage)
      : undefined

  const sourceOwner = parentOf(configuration, moved)
  const destinationOwner =
    into === undefined
      ? parentOf(configuration, target)
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
  const depth = ancestorsOf(configuration, target).length + (into === undefined ? 0 : 1)
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
  const anchor = rest.indexOf(target.widget)
  if (relation !== 'inside' && anchor < 0) return undefined
  // The panel lists a stack top first while this sequence is back to front, so
  // "above the target" is the position *after* it. `inside` takes the back of
  // back-to-front, which is the top of the container's stack — a widget just
  // dropped into a container should be visible in it, not buried under it.
  const at = relation === 'inside' ? rest.length : anchor + (relation === 'above' ? 1 : 0)
  const order = [...rest.slice(0, at), moved.widget, ...rest.slice(at)]

  return {
    widget: moved.widget,
    sourceOwner,
    destinationOwner,
    order,
    absolute: absolutePlacement(configuration, id),
    origin: destinationOrigin(
      configuration,
      relation === 'inside'
        ? target.widget.id
        : ancestorsOf(configuration, target).at(-1)?.id
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

/** Whether the panel should offer this drop at all, and light up the band for it. */
export function canMoveWidget(id: string, relation: DropRelation, targetId: string): boolean {
  return planMove(useDeviceStore.getState().draft, id, relation, targetId) !== undefined
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
  if (!planMove(useDeviceStore.getState().draft, id, relation, targetId)?.changed) return false
  const reveal: { slot: string; page: number }[] = []
  mutateDraftConfiguration((configuration) => {
    const plan = planMove(configuration, id, relation, targetId)
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
