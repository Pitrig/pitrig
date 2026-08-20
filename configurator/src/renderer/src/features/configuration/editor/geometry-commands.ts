import type { WidgetConfiguration, WidgetPlacement } from '@shared/configuration-schema'
import { scaleWidgetPixels } from '@shared/layout-transfer'

import { findWidget, mutateDraftConfiguration, parentOffset, widgetArrayOf, writePlacement } from './document'
import { clamp, clampToDisplay } from './placement'

/** One widget being dragged along with the primary, at the box it started at. */
export interface DragFollower {
  id: string
  placement: Required<WidgetPlacement>
}

/**
 * Moves the primary widget to `placement` and carries its followers by the
 * same shift, in one document edit.
 *
 * Everything here is in display coordinates and written back in each widget's
 * own parent space, which is what makes a drag inside a container behave like
 * a drag on the screen. Followers are clamped to the display; the primary is
 * not, because the caller has already resolved it against the snap targets.
 *
 * This lived inside the canvas component's pointer handler, so the document
 * was mutated from a render function and the rule for where a dragged widget
 * lands was not anywhere an editor command could find it.
 */
export function moveSelection(
  primaryId: string,
  placement: Required<WidgetPlacement>,
  shift: { x: number; y: number },
  followers: readonly DragFollower[],
  display: { width: number; height: number }
): void {
  mutateDraftConfiguration((draft) => {
    const primary = findWidget(draft, primaryId)
    if (primary) {
      writePlacement(primary.widget, placement, parentOffset(draft, primaryId))
    }
    for (const follower of followers) {
      const widget = findWidget(draft, follower.id)?.widget
      if (!widget) continue
      const onDisplay = clampToDisplay(
        follower.placement.x + shift.x,
        follower.placement.y + shift.y,
        follower.placement.width,
        follower.placement.height,
        display
      )
      writePlacement(
        widget,
        { ...follower.placement, ...onDisplay },
        parentOffset(draft, follower.id)
      )
    }
  })
}

/** One widget as a resize found it, which is what every frame re-derives from. */
export interface ScaleSubject {
  id: string
  /**
   * The widget exactly as it stood when the gesture began. A pointer stream
   * commits many times, and each commit has to produce the same answer for the
   * same pointer position — so a frame scales this rather than whatever the
   * previous frame left behind, which would compound a factor per frame and
   * shrink a font to nothing on the way back.
   */
  original: WidgetConfiguration
  /** Its box in display coordinates when the gesture began. */
  box: Required<WidgetPlacement>
}

/**
 * Resizes one widget or a whole selection by mapping the box the gesture
 * started with onto the box it has resolved to.
 *
 * Every subject keeps its position within that box, so the space between two
 * widgets scales with them and a row stays a row. Boxes are mapped by their
 * edges rather than by their extents, the way a board transfer does it: two
 * widgets that shared an edge still share it afterwards, and rounding does not
 * accumulate along the row.
 *
 * `scaleContents` is the author's mode. Off, a container's box is all that
 * moves and what it holds stays where it was put — the behaviour a container
 * has always had here, and what an authored offset means on the device. On,
 * every pixel-valued property inside scales too, fonts included, so the widget
 * arrives looking like itself at another size.
 */
export function scaleWidgets(
  subjects: readonly ScaleSubject[],
  from: Required<WidgetPlacement>,
  to: Required<WidgetPlacement>,
  display: { width: number; height: number },
  scaleContents: boolean
): void {
  const factorX = from.width > 0 ? to.width / from.width : 1
  const factorY = from.height > 0 ? to.height / from.height : 1
  const scale = { x: factorX, y: factorY, min: Math.min(factorX, factorY) }
  mutateDraftConfiguration((draft) => {
    for (const subject of subjects) {
      const location = findWidget(draft, subject.id)
      if (!location) continue
      const widgets = widgetArrayOf(draft, location)
      const index = location.path[location.path.length - 1]
      if (!widgets || index === undefined) continue
      // A JSON round trip rather than structuredClone, for the reason the board
      // transfer states: structuredClone preserves aliases, so two widgets
      // sharing one font object would have its size scaled twice.
      const next = JSON.parse(JSON.stringify(subject.original)) as WidgetConfiguration
      const nearX = to.x + (subject.box.x - from.x) * factorX
      const nearY = to.y + (subject.box.y - from.y) * factorY
      const farX = to.x + (subject.box.x + subject.box.width - from.x) * factorX
      const farY = to.y + (subject.box.y + subject.box.height - from.y) * factorY
      const x = clamp(Math.round(nearX), 0, Math.max(0, display.width - 1))
      const y = clamp(Math.round(nearY), 0, Math.max(0, display.height - 1))
      const box = {
        x,
        y,
        width: clamp(Math.round(farX) - Math.round(nearX), 1, Math.max(1, display.width - x)),
        height: clamp(Math.round(farY) - Math.round(nearY), 1, Math.max(1, display.height - y))
      }
      if (scaleContents) scaleWidgetPixels(next, scale)
      writePlacement(next, box, parentOffset(draft, subject.id))
      widgets[index] = next
    }
  })
}
