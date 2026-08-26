import { useEffect, useState, type RefObject } from 'react'
import type { DisplayDescriptor } from '@shared/device'
import { clamp } from '../editor/placement'
import { isTextEntry } from '../editor/keyboard'
import { MAXIMUM_ZOOM, MINIMUM_ZOOM, useDashboardEditorStore } from '../dashboard-editor'
import { clampPan, logicalPoint, viewportScale } from './canvas-geometry'

export function useCanvasView(
  svgRef: RefObject<SVGSVGElement | null>,
  display: DisplayDescriptor
): { spaceHeld: boolean } {
  const [spaceHeld, setSpaceHeld] = useState(false)

  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || isTextEntry(event.target)) return
      event.preventDefault()
      setSpaceHeld(true)
    }
    const up = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    const clear = (): void => setSpaceHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useEffect(() => {
    const element = svgRef.current
    if (!element) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const store = useDashboardEditorStore.getState()
      const current = store.view
      if (event.ctrlKey || event.metaKey) {
        const point = logicalPoint(element, event.clientX, event.clientY)
        const zoom = clamp(
          current.zoom * (event.deltaY < 0 ? 1.25 : 0.8),
          MINIMUM_ZOOM,
          MAXIMUM_ZOOM
        )
        if (!point) {
          store.setView({ zoom, ...clampPan(current, display, zoom) })
          return
        }
        store.setView({
          zoom,
          ...clampPan(
            {
              panX: point.x - (point.x - current.panX) * (current.zoom / zoom),
              panY: point.y - (point.y - current.panY) * (current.zoom / zoom)
            },
            display,
            zoom
          )
        })
        return
      }
      const scale = viewportScale(element, display, current.zoom)
      store.setView(
        clampPan(
          {
            panX: current.panX + event.deltaX / scale,
            panY: current.panY + event.deltaY / scale
          },
          display,
          current.zoom
        )
      )
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [display, svgRef])

  return { spaceHeld }
}
