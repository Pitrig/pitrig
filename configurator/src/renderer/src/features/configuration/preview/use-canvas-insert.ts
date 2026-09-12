import { useEffect, useMemo, useState } from 'react'
import {
  type WidgetSelection,
  findWidget,
  moveWidgetInto,
  mutateDraftConfiguration,
  parentContainerId,
  parentOffset,
  writePlacement
} from '../dashboard-editor'
import type { PendingInsert } from '../editor/store'
import { fitWidgetToDisplay, placeTemplateWidget } from '../editor/insert-template'
import { clamp } from '../editor/placement'
import { type Placement, containerAt, logicalPoint } from './canvas-geometry'
import type { CanvasContext } from './canvas-gesture-context'
import { useDeviceStore } from '@/features/device/device-store'
import { withEditGroup } from '@/features/device/edit-group'

export function useCanvasInsert(
  context: CanvasContext,
  pendingInsert: PendingInsert | undefined,
  cancelInsert: () => void
): {
  insertAt: { x: number; y: number } | undefined
  fittedInsert: ReturnType<typeof fitWidgetToDisplay> | undefined
  placePendingInsert: (event: React.PointerEvent<SVGSVGElement>) => boolean
  updateGhost: (event: React.PointerEvent<SVGSVGElement>) => void
} {
  const { svgRef, display } = context
  const [ghost, setGhost] = useState<{ insert: PendingInsert; x: number; y: number }>()
  const insertAt = ghost && ghost.insert === pendingInsert ? ghost : undefined
  const fittedInsert = useMemo(
    () => (pendingInsert ? fitWidgetToDisplay(pendingInsert.widget, display) : undefined),
    [pendingInsert, display]
  )

  useEffect(() => {
    if (!pendingInsert) return
    const away = (event: PointerEvent): void => {
      if (!svgRef.current?.contains(event.target as Node)) cancelInsert()
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      cancelInsert()
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [pendingInsert, cancelInsert, svgRef])

  const placePendingInsert = (event: React.PointerEvent<SVGSVGElement>): boolean => {
    if (!pendingInsert || !fittedInsert || event.button !== 0) return false
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    if (!point) return false
    const box = centeredOn(point, fittedInsert, display)
    const into = containerAt(
      context.layers,
      context.placements,
      box,
      new Set(),
      context.locked,
      context.hidden
    )
    let added: WidgetSelection | undefined
    withEditGroup(() => {
      added = placeTemplateWidget(pendingInsert, display, point)
      if (added?.type !== 'widget') return
      if (parentContainerId(useDeviceStore.getState().draft, added) !== into) {
        moveWidgetInto(added.id, into)
      }
      settlePlacement(added.id, box)
    })
    cancelInsert()
    if (added) context.select(added)
    return true
  }

  const updateGhost = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!pendingInsert) return
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    setGhost(point ? { insert: pendingInsert, ...point } : undefined)
  }

  return { insertAt, fittedInsert, placePendingInsert, updateGhost }
}

function centeredOn(
  point: { x: number; y: number },
  fitted: { width: number; height: number },
  display: { width: number; height: number }
): Placement {
  return {
    x: clamp(Math.round(point.x - fitted.width / 2), 0, Math.max(0, display.width - fitted.width)),
    y: clamp(
      Math.round(point.y - fitted.height / 2),
      0,
      Math.max(0, display.height - fitted.height)
    ),
    width: fitted.width,
    height: fitted.height
  }
}

function settlePlacement(id: string, box: Placement): void {
  mutateDraftConfiguration((configuration) => {
    const widget = findWidget(configuration, id)?.widget
    if (widget) writePlacement(widget, box, parentOffset(configuration, id))
  })
}
