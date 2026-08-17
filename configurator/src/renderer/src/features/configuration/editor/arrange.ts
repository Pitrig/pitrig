import { allWidgetsOf, createWidgetId, stackOrder, widgetsOf } from '../../../../../shared/configuration-access'
import { MAXIMUM_NESTING_DEPTH, MAXIMUM_WIDGETS_PER_CONTAINER, MAXIMUM_WIDGETS_PER_SCREEN, type ScreenConfiguration, type ShapeWidgetConfiguration, type WidgetConfiguration, type WidgetPlacement } from '../../../../../shared/configuration-schema'
import { type DeviceConfiguration } from '../../../../../shared/device'
import { type WidgetLocation, absolutePlacement, ancestorsOf, completePlacement, findWidget, mutateDraftConfiguration, parentOf, parentOffset, widgetArrayOf } from './document'
import { useDashboardEditorStore } from './store'
import { useDeviceStore } from '@/features/device/device-store'

/**
 * Wraps the selected widgets in a container shape sized to their bounds,
 * rewriting their geometry to be relative to it. Wrapping is a document edit
 * rather than an editor annotation, because the device needs the container to
 * switch what an area of the screen shows — see ADR 0021.
 *
 * Every selected widget must share one parent, since the container takes their
 * place in that one array. They may already be inside a container: nesting is
 * what a container is for.
 */
export function wrapInShape(ids: readonly string[]): string | undefined {
  if (ids.length === 0) return undefined
  const configuration = useDeviceStore.getState().draft
  if (!configuration) return undefined
  const locations = ids
    .map((id) => findWidget(configuration, id))
    .filter((location): location is WidgetLocation => location !== undefined)
  if (locations.length !== ids.length) return undefined
  const first = locations[0]!
  const parentPath = first.path.slice(0, -1).join('/')
  if (
    locations.some(
      (location) =>
        location.screenIndex !== first.screenIndex ||
        location.path.slice(0, -1).join('/') !== parentPath
    )
  ) {
    return undefined
  }
  // A widget with no usable box has nothing to contribute to the container's
  // bounds, so wrapping is refused rather than guessed at.
  const boxes = locations.map(({ widget }) => completePlacement(widget.placement))
  if (boxes.some((box) => box === undefined)) return undefined
  const placed = boxes as Required<WidgetPlacement>[]
  const left = Math.min(...placed.map((box) => box.x))
  const top = Math.min(...placed.map((box) => box.y))
  const right = Math.max(...placed.map((box) => box.x + box.width))
  const bottom = Math.max(...placed.map((box) => box.y + box.height))
  if (right <= left || bottom <= top) return undefined

  const id = createWidgetId()
  let created: string | undefined
  mutateDraftConfiguration((next) => {
    const siblings = widgetArrayOf(next, first)
    if (!siblings) return
    if (siblings.length > MAXIMUM_WIDGETS_PER_CONTAINER) return
    const members: WidgetConfiguration[] = []
    let insertion = siblings.length
    for (const memberId of ids) {
      const index = siblings.findIndex((widget) => widget.id === memberId)
      const widget = siblings[index]
      if (index < 0 || !widget) continue
      insertion = Math.min(insertion, index)
      siblings.splice(index, 1)
      const box = completePlacement(widget.placement)
      if (!box) continue
      members.push({
        ...widget,
        placement: { ...box, x: box.x - left, y: box.y - top }
      })
    }
    if (members.length === 0) return
    // Put the container where the first member was, so wrapping does not
    // silently restack the parent it happened in.
    siblings.splice(insertion, 0, {
      type: 'shape',
      kind: 'rectangle',
      id,
      placement: { x: left, y: top, width: right - left, height: bottom - top },
      widgets: members
    })
    created = id
  })
  return created
}

/**
 * Puts a container's widgets back beside it and removes it, adding its offset
 * back into their geometry. The exact inverse of wrapInShape, at any depth.
 */
export function unwrapShape(id: string): string[] {
  const released: string[] = []
  mutateDraftConfiguration((configuration) => {
    const location = findWidget(configuration, id)
    if (!location || location.widget.type !== 'shape') return
    const siblings = widgetArrayOf(configuration, location)
    const index = location.path[location.path.length - 1]
    if (!siblings || index === undefined) return
    const container = siblings[index]
    if (container?.type !== 'shape') return
    const box = completePlacement(container.placement)
    if (!box) return
    const members = widgetsOf(container).map((member) => {
      const memberBox = completePlacement(member.placement)
      if (member.id) released.push(member.id)
      return {
        ...member,
        ...(memberBox
          ? { placement: { ...memberBox, x: memberBox.x + box.x, y: memberBox.y + box.y } }
          : {})
      }
    })
    siblings.splice(index, 1, ...members)
  })
  return released
}

export type AlignmentEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type DistributionAxis = 'horizontal' | 'vertical'

/**
 * Aligns every selected widget to the extreme of the group. Alignment reads the
 * group's own bounds rather than the display's, so aligning three readouts left
 * lines them up with the leftmost of the three, not with the screen edge.
 */
export function alignWidgets(ids: readonly string[], edge: AlignmentEdge): void {
  if (ids.length < 2) return
  mutateDraftConfiguration((configuration) => {
    const placed = selectedPlacements(configuration, ids)
    if (placed.length < 2) return
    const left = Math.min(...placed.map(({ placement }) => placement.x))
    const right = Math.max(...placed.map(({ placement }) => placement.x + placement.width))
    const top = Math.min(...placed.map(({ placement }) => placement.y))
    const bottom = Math.max(...placed.map(({ placement }) => placement.y + placement.height))
    for (const { widget, placement, offset } of placed) {
      const next = { ...placement }
      if (edge === 'left') next.x = left
      else if (edge === 'right') next.x = right - placement.width
      else if (edge === 'center') next.x = Math.round((left + right - placement.width) / 2)
      else if (edge === 'top') next.y = top
      else if (edge === 'bottom') next.y = bottom - placement.height
      else next.y = Math.round((top + bottom - placement.height) / 2)
      writePlacement(widget, next, offset)
    }
  })
}

/**
 * Spreads the widgets between the two outermost ones so the gaps between them
 * are equal. The ends stay where they are, which is what makes the result
 * predictable: distributing twice changes nothing.
 */
export function distributeWidgets(ids: readonly string[], axis: DistributionAxis): void {
  if (ids.length < 3) return
  mutateDraftConfiguration((configuration) => {
    const placed = selectedPlacements(configuration, ids)
    if (placed.length < 3) return
    const horizontal = axis === 'horizontal'
    const ordered = [...placed].sort((left, right) =>
      horizontal ? left.placement.x - right.placement.x : left.placement.y - right.placement.y
    )
    const first = ordered[0]!.placement
    const last = ordered[ordered.length - 1]!.placement
    const span = horizontal
      ? last.x + last.width - first.x
      : last.y + last.height - first.y
    const occupied = ordered.reduce(
      (total, { placement }) => total + (horizontal ? placement.width : placement.height),
      0
    )
    const gap = (span - occupied) / (ordered.length - 1)
    let cursor = horizontal ? first.x : first.y
    for (const { widget, placement, offset } of ordered) {
      writePlacement(
        widget,
        horizontal
          ? { ...placement, x: Math.round(cursor) }
          : { ...placement, y: Math.round(cursor) },
        offset
      )
      cursor += (horizontal ? placement.width : placement.height) + gap
    }
  })
}

/**
 * The selection in display coordinates, whatever parents the widgets sit in.
 * Aligning a widget in a container against one on the screen has to compare boxes
 * in one space; `offset` is what each result subtracts on the way back.
 */
function selectedPlacements(
  configuration: DeviceConfiguration,
  ids: readonly string[]
): {
  widget: WidgetConfiguration
  placement: Required<WidgetPlacement>
  offset: { x: number; y: number }
}[] {
  const placed: {
    widget: WidgetConfiguration
    placement: Required<WidgetPlacement>
    offset: { x: number; y: number }
  }[] = []
  for (const id of ids) {
    const widget = findWidget(configuration, id)?.widget
    const placement = absolutePlacement(configuration, id)
    if (widget && placement) {
      placed.push({ widget, placement, offset: parentOffset(configuration, id) })
    }
  }
  return placed
}

/** Writes a display-space box back into the widget's own coordinate space. */
function writePlacement(
  widget: WidgetConfiguration,
  placement: Required<WidgetPlacement>,
  offset: { x: number; y: number }
): void {
  widget.placement = { ...placement, x: placement.x - offset.x, y: placement.y - offset.y }
}

/** Where a dropped widget lands relative to the row it was dropped on. */
export type DropRelation = 'above' | 'below' | 'inside'

interface MovePlan {
  widget: WidgetConfiguration
  sourceOwner: ScreenConfiguration | ShapeWidgetConfiguration
  destinationOwner: ScreenConfiguration | ShapeWidgetConfiguration
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
  if (widget.type !== 'shape') return undefined
  const below = widgetsOf(widget)
    .map(containerHeight)
    .filter((level): level is number => level !== undefined)
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
  if (relation === 'inside' && target.widget.type !== 'shape') return undefined

  const sourceOwner = parentOf(configuration, moved)
  const destinationOwner =
    relation === 'inside'
      ? (target.widget as ShapeWidgetConfiguration)
      : parentOf(configuration, target)
  if (!sourceOwner || !destinationOwner) return undefined
  const sameParent = sourceOwner === destinationOwner

  // The depth the validator walks the destination array at, mirroring its own
  // walk: a container's array is one deeper than the array the container sits in.
  const depth = relation === 'inside' ? target.path.length : target.path.length - 1
  if (!sameParent) {
    // What has to fit is the subtree's own tallest container, not just the
    // widget: a container of containers dropped two deep pushes its own past the
    // cap even though the widget itself would fit.
    const height = containerHeight(moved.widget)
    if (height !== undefined && depth + height + 2 > MAXIMUM_NESTING_DEPTH) return undefined
    const capacity = depth === 0 ? MAXIMUM_WIDGETS_PER_SCREEN : MAXIMUM_WIDGETS_PER_CONTAINER
    if ((destinationOwner.widgets?.length ?? 0) >= capacity) return undefined
    // A slot is one box under one parent, and the device compares the parent as
    // well as the box. Pulling one member out of the parent it shares with its
    // peers redefines the slot rather than moving a widget, and the configurator's
    // own validator would not catch it. A lone member has nothing to strand.
    const slot = moved.widget.type === 'shape' ? (moved.widget.slot ?? 0) : 0
    if (
      slot > 0 &&
      allWidgetsOf(configuration).filter(
        (other) => other.type === 'shape' && (other.slot ?? 0) === slot
      ).length > 1
    ) {
      return undefined
    }
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
  const reveal: { slot: number; id: string }[] = []
  mutateDraftConfiguration((configuration) => {
    const plan = planMove(configuration, id, relation, targetId)
    if (!plan) return
    applyMove(plan)
    const landed = findWidget(configuration, id)
    for (const ancestor of landed ? ancestorsOf(configuration, landed) : []) {
      if ((ancestor.slot ?? 0) > 0 && ancestor.id) {
        reveal.push({ slot: ancestor.slot as number, id: ancestor.id })
      }
    }
  })
  // A container in a slot the toolbar is not looking at is not drawn, so a widget
  // dropped into one would vanish on release and read as a delete.
  for (const { slot, id: container } of reveal) {
    useDashboardEditorStore.getState().setPreviewSlot(slot, container)
  }
  return true
}
