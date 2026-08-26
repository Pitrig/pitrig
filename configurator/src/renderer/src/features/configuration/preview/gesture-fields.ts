import { descendantsOf } from '@shared/configuration-access'
import { ancestorsOf, findWidget } from '../dashboard-editor'
import type { ScaleSubject } from '../editor/geometry-commands'
import { contentArea } from './preview-geometry-paint'
import { containerAt, type Follower, type Placement } from './canvas-geometry'
import type { SnapField, SnapPreferences } from './snapping'
import { snapMode, type CanvasContext } from './canvas-gesture-context'
import { useDeviceStore } from '@/features/device/device-store'

export function preferences(
  context: CanvasContext,
  event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }
): SnapPreferences {
  return {
    grid: context.snap.snapToGrid ? context.gridSize : 0,
    tolerance: context.snap.tolerancePx / context.view.zoom,
    widgets: context.snap.snapToWidgets,
    spacing: context.snap.snapToSpacing,
    mode: snapMode(event)
  }
}

export function snapField(
  context: CanvasContext,
  levelId: string | undefined,
  excluded: ReadonlySet<string>
): SnapField {
  const siblings = context.layers
    .filter((layer) => layer.parentId === levelId)
    .map((layer) => layer.configuration.id)
    .filter((id): id is string => id !== undefined && !excluded.has(id) && !context.hidden[id])
    .map((id) => ({ id, box: context.placements.get(id) }))
    .filter((entry): entry is { id: string; box: Placement } => entry.box !== undefined)
  const container =
    levelId === undefined ? undefined : findWidget(context.configuration, levelId)?.widget
  const bounds = levelId === undefined ? undefined : context.placements.get(levelId)
  if (!container || !bounds) {
    return {
      siblings,
      bounds: { x: 0, y: 0, width: context.display.width, height: context.display.height }
    }
  }
  return {
    siblings,
    bounds,
    inner: contentArea(bounds, container.border?.width_px ?? 0, container.padding)
  }
}

export function excludedFrom(movedId: string, followers: readonly Follower[]): Set<string> {
  const widget = findWidget(useDeviceStore.getState().draft, movedId)?.widget
  const excluded = new Set(
    (widget ? descendantsOf(widget) : [])
      .map((entry) => entry.id)
      .filter((entry): entry is string => entry !== undefined)
  )
  excluded.add(movedId)
  for (const follower of followers) excluded.add(follower.id)
  return excluded
}

export function dropTargetFor(
  context: CanvasContext,
  box: Placement | undefined,
  excluded: ReadonlySet<string>,
  followers: number
): string | undefined {
  if (!box || followers > 0) return undefined
  return containerAt(
    context.layers,
    context.placements,
    box,
    excluded,
    context.locked,
    context.hidden
  )
}

export function resizeSubjects(
  context: CanvasContext,
  ids: readonly string[]
): ScaleSubject[] {
  const draft = useDeviceStore.getState().draft
  const chosen = new Set(ids)
  return ids
    .map((id) => {
      const location = findWidget(draft, id)
      const box = context.placements.get(id)
      if (!location || !box) return undefined
      const inherited = ancestorsOf(draft, location).some(
        (ancestor) => ancestor.id !== undefined && chosen.has(ancestor.id)
      )
      if (inherited) return undefined
      return {
        id,
        original: JSON.parse(JSON.stringify(location.widget)) as ScaleSubject['original'],
        box
      }
    })
    .filter((subject): subject is ScaleSubject => subject !== undefined)
}
