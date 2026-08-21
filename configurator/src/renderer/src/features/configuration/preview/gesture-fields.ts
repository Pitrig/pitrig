import { descendantsOf } from '@shared/configuration-access'
import { ancestorsOf, findWidget } from '../dashboard-editor'
import type { ScaleSubject } from '../editor/geometry-commands'
import { contentArea } from './preview-geometry-paint'
import { containerAt, type Follower, type Placement } from './canvas-geometry'
import type { SnapField, SnapPreferences } from './snapping'
import { snapMode, type CanvasContext } from './canvas-gesture-context'
import { useDeviceStore } from '@/features/device/device-store'

// The pure half of a canvas gesture: which boxes a drag lines up with, which
// container it would land in, and what a resize will rewrite. All of it reads
// the CanvasContext of the render that started the gesture, so the hook that
// owns the pointer state stays the only stateful piece.

export function preferences(
  context: CanvasContext,
  event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }
): SnapPreferences {
  return {
    grid: context.snap.snapToGrid ? context.gridSize : 0,
    // Snapping is in logical pixels, so the tolerance shrinks as the canvas is
    // magnified and stays the same distance under the pointer.
    tolerance: context.snap.tolerancePx / context.view.zoom,
    widgets: context.snap.snapToWidgets,
    spacing: context.snap.snapToSpacing,
    mode: snapMode(event)
  }
}

/**
 * The level a gesture lines up within: the siblings of whichever container
 * holds the box, that container's own edges and the area inside its padding.
 *
 * A widget only ever lines up with what it lives beside. Treating the whole
 * screen as one field made a readout inside a panel snap to a readout in the
 * panel next door — two boxes that have nothing to do with each other and
 * that the author cannot see a relationship between.
 */
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

/** A widget, everything inside it, and everything moving with it. */
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

/**
 * The container a dragged widget would join, resolved against the document as
 * it stands. A widget cannot land in itself or in anything it holds, and a
 * group drag lands nowhere: reparenting only the widget under the pointer
 * would split the selection across two boxes.
 */
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

/**
 * What a resize will rewrite, snapshotted before the first frame. A widget
 * inside another selected widget is left out: it would be scaled once by its
 * own entry and again by its container's, and compound.
 */
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
