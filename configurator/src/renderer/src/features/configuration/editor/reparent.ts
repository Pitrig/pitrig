import { pagesOf, stackOrder, subtreeHeight, type WidgetParent } from '@shared/configuration-access'
import { MAXIMUM_NESTING_DEPTH, MAXIMUM_WIDGETS_PER_CONTAINER, MAXIMUM_WIDGETS_PER_SCREEN, type WidgetConfiguration } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import type { WidgetPlacement } from '@shared/configuration-schema'
import { absolutePlacement, ancestorsOf, findWidget, mutateDraftConfiguration, parentOf, parentOffset, writePlacement } from './document'
import { visibleSlotPage } from '../preview/canvas-geometry'
import { useDashboardEditorStore } from './store'
import { useDeviceStore } from '@/features/device/device-store'

export type DropRelation = 'above' | 'below' | 'inside'

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
  order: WidgetConfiguration[]
  absolute?: Required<WidgetPlacement>
  origin: { x: number; y: number }
  changed: boolean
}

function destinationOrigin(
  configuration: DeviceConfiguration,
  containerId: string | undefined
): { x: number; y: number } {
  if (!containerId) return { x: 0, y: 0 }
  const box = absolutePlacement(configuration, containerId)
  return box ? { x: box.x, y: box.y } : parentOffset(configuration, containerId)
}

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
  if (target && ancestorsOf(configuration, target).some((ancestor) => ancestor.id === id)) {
    return undefined
  }
  const into = destination.kind === 'inside' ? target?.widget : undefined
  if (into !== undefined && into.type !== 'shape' && into.type !== 'slot') return undefined
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

  const depth =
    target === undefined
      ? 0
      : ancestorsOf(configuration, target).length + (into === undefined ? 0 : 1)
  if (!sameParent) {
    if (moved.widget.type === 'slot' && depth > 0) return undefined
    if (depth + subtreeHeight(moved.widget) >= MAXIMUM_NESTING_DEPTH) return undefined
    const capacity = depth === 0 ? MAXIMUM_WIDGETS_PER_SCREEN : MAXIMUM_WIDGETS_PER_CONTAINER
    if ((destinationOwner.widgets?.length ?? 0) >= capacity) return undefined
  }

  const stack = stackOrder(destinationOwner.widgets).map(({ widget }) => widget)
  const rest = stack.filter((widget) => widget !== moved.widget)
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

function applyMove(plan: MovePlan): void {
  const source = plan.sourceOwner.widgets
  const at = source?.indexOf(plan.widget) ?? -1
  if (!source || at < 0) return
  source.splice(at, 1)
  if (plan.absolute) writePlacement(plan.widget, plan.absolute, plan.origin)
  const destination = (plan.destinationOwner.widgets ??= [])
  destination.splice(0, destination.length, ...plan.order)
  plan.order.forEach((widget, index) => {
    widget.z_index = index
  })
  if (source.length === 0) delete plan.sourceOwner.widgets
}

export function canMoveWidgetInto(id: string, containerId: string, page?: number): boolean {
  return (
    planMove(useDeviceStore.getState().draft, id, { kind: 'inside', containerId, page }) !==
    undefined
  )
}

export function canMoveWidget(id: string, relation: DropRelation, targetId: string): boolean {
  return (
    planMove(useDeviceStore.getState().draft, id, destinationOf(relation, targetId)) !==
    undefined
  )
}

export function moveWidget(id: string, relation: DropRelation, targetId: string): boolean {
  return runMove(id, destinationOf(relation, targetId))
}

export function moveWidgetInto(
  id: string,
  containerId: string | undefined,
  page?: number
): boolean {
  if (containerId !== undefined) return runMove(id, { kind: 'inside', containerId, page })
  const screen = findWidget(useDeviceStore.getState().draft, id)?.screenIndex
  return screen === undefined ? false : runMove(id, { kind: 'screen', index: screen })
}

function runMove(id: string, destination: MoveDestination): boolean {
  if (!planMove(useDeviceStore.getState().draft, id, destination)?.changed) return false
  const reveal: { slot: string; page: number }[] = []
  mutateDraftConfiguration((configuration) => {
    const plan = planMove(configuration, id, destination)
    if (!plan) return false
    applyMove(plan)
    const landed = findWidget(configuration, id)
    if (!landed) return true
    let cursor = 0
    for (const ancestor of ancestorsOf(configuration, landed)) {
      cursor += 1
      if (ancestor.type !== 'slot') continue
      if (ancestor.id) reveal.push({ slot: ancestor.id, page: landed.path[cursor] ?? 0 })
      cursor += 1
    }
  })
  for (const { slot, page } of reveal) {
    useDashboardEditorStore.getState().setSlotPage(slot, page)
  }
  return true
}
