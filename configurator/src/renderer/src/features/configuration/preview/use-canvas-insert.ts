import { useEffect, useState, type RefObject } from 'react'
import type { DisplayDescriptor } from '@shared/device'
import type { WidgetSelection } from '../dashboard-editor'
import type { PendingInsert } from '../editor/store'
import { fitWidgetToDisplay, placeTemplateWidget } from '../editor/insert-template'
import { logicalPoint } from './canvas-geometry'

export function useCanvasInsert(
  svgRef: RefObject<SVGSVGElement | null>,
  display: DisplayDescriptor,
  pendingInsert: PendingInsert | undefined,
  cancelInsert: () => void,
  select: (selection: WidgetSelection) => void
): {
  insertAt: { x: number; y: number } | undefined
  fittedInsert: ReturnType<typeof fitWidgetToDisplay> | undefined
  placePendingInsert: (event: React.PointerEvent<SVGSVGElement>) => boolean
  updateGhost: (event: React.PointerEvent<SVGSVGElement>) => void
} {
  const [ghost, setGhost] = useState<{ insert: PendingInsert; x: number; y: number }>()
  const insertAt = ghost && ghost.insert === pendingInsert ? ghost : undefined
  const fittedInsert = pendingInsert ? fitWidgetToDisplay(pendingInsert.widget, display) : undefined

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
    if (!pendingInsert || event.button !== 0) return false
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    if (!point) return false
    const added = placeTemplateWidget(pendingInsert, display, point)
    cancelInsert()
    if (added) select(added)
    return true
  }

  const updateGhost = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!pendingInsert) return
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    setGhost(point ? { insert: pendingInsert, ...point } : undefined)
  }

  return { insertAt, fittedInsert, placePendingInsert, updateGhost }
}
