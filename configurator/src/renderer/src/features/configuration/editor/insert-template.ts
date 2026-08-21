import type { WidgetConfiguration } from '@shared/configuration-schema'
import { scaleWidgetPixels } from '@shared/layout-transfer'
import { clamp } from './placement'
import { completePlacement, mutateDraftConfiguration } from './document'
import type { PendingInsert, WidgetSelection } from './store'
import { insertWidget } from './widgets'

/**
 * Putting a saved widget onto the canvas.
 *
 * A library entry arrives with the box it was drawn at, on whatever display it
 * was drawn on. That box is kept: a gauge saved at 180 × 180 is worth 180 × 180
 * here too, and rescaling it because the boards differ would quietly undo the
 * author's sizing. It is scaled only when it would not otherwise fit — and then
 * by the smallest factor that makes it fit, through the same engine a board
 * transfer uses, so the fonts, borders and radii inside it come down with the
 * box rather than a big frame ending up around the same small text.
 */

export interface FittedWidget {
  widget: WidgetConfiguration
  width: number
  height: number
  /** 1 when nothing had to be given up; below 1 when the display was too small. */
  scale: number
}

export function fitWidgetToDisplay(
  widget: WidgetConfiguration,
  display: { width: number; height: number }
): FittedWidget {
  const clone = structuredClone(widget)
  const box = completePlacement(clone.placement)
  if (!box || box.width <= 0 || box.height <= 0) {
    return { widget: clone, width: box?.width ?? 0, height: box?.height ?? 0, scale: 1 }
  }
  // Never above one: fitting means "make it fit", not "fill the display".
  const scale = Math.min(1, display.width / box.width, display.height / box.height)
  if (scale >= 1) return { widget: clone, width: box.width, height: box.height, scale: 1 }

  const width = Math.max(1, Math.round(box.width * scale))
  const height = Math.max(1, Math.round(box.height * scale))
  clone.placement = { ...box, width, height }
  scaleWidgetPixels(clone, { x: scale, y: scale, min: scale })
  return { widget: clone, width, height, scale }
}

/**
 * Places the pending widget with its centre under the pointer, kept inside the
 * display. Centring rather than dropping a corner there is what makes the ghost
 * honest: what the pointer is over is what lands.
 */
export function placeTemplateWidget(
  insert: PendingInsert,
  display: { width: number; height: number },
  at: { x: number; y: number }
): WidgetSelection | undefined {
  const fitted = fitWidgetToDisplay(insert.widget, display)
  const box = completePlacement(fitted.widget.placement)
  if (!box) return undefined

  // Ids are not renamed here: `insertWidget` gives the whole subtree fresh ones.
  const placed: WidgetConfiguration = {
    ...fitted.widget,
    placement: {
      ...box,
      x: clamp(Math.round(at.x - box.width / 2), 0, Math.max(0, display.width - box.width)),
      y: clamp(Math.round(at.y - box.height / 2), 0, Math.max(0, display.height - box.height))
    }
  }

  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, placed)
  })
  return added
}
