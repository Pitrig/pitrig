import type { WidgetConfiguration } from '@shared/configuration-schema'
import { scaleWidgetPixels } from '@shared/layout-transfer'
import { clamp } from './placement'
import { completePlacement, mutateDraftConfiguration } from './document'
import type { PendingInsert, WidgetSelection } from './store'
import { insertWidget } from './widgets'

export interface FittedWidget {
  widget: WidgetConfiguration
  width: number
  height: number
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
  const scale = Math.min(1, display.width / box.width, display.height / box.height)
  if (scale >= 1) return { widget: clone, width: box.width, height: box.height, scale: 1 }

  const width = Math.max(1, Math.round(box.width * scale))
  const height = Math.max(1, Math.round(box.height * scale))
  clone.placement = { ...box, width, height }
  scaleWidgetPixels(clone, { x: scale, y: scale, min: scale })
  return { widget: clone, width, height, scale }
}

export function placeTemplateWidget(
  insert: PendingInsert,
  display: { width: number; height: number },
  at: { x: number; y: number }
): WidgetSelection | undefined {
  const fitted = fitWidgetToDisplay(insert.widget, display)
  const box = completePlacement(fitted.widget.placement)
  if (!box) return undefined

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
