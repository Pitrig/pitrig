import type { WidgetConfiguration, WidgetPlacement } from '@shared/configuration-schema'
import { scaleWidgetPixels } from '@shared/layout-transfer'

import { findWidget, mutateDraftConfiguration, parentOffset, widgetArrayOf, writePlacement } from './document'
import { clamp, clampToDisplay } from './placement'

export interface DragFollower {
  id: string
  placement: Required<WidgetPlacement>
}

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

export interface ScaleSubject {
  id: string
  original: WidgetConfiguration
  box: Required<WidgetPlacement>
}

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
