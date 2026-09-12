import { useEffect, useRef, useState, type RefObject } from 'react'
import type { DisplayDescriptor } from '@shared/device'
import { clamp } from '../editor/placement'
import { isTextEntry } from '../editor/keyboard'
import { MAXIMUM_ZOOM, MINIMUM_ZOOM, useDashboardEditorStore } from '../dashboard-editor'
import { clampPan, logicalPoint, viewportScale } from './canvas-geometry'

const ZOOM_WHEEL_RATE = 0.0022

export function useCanvasView(
  svgRef: RefObject<SVGSVGElement | null>,
  display: DisplayDescriptor
): { spaceHeld: boolean } {
  const [spaceHeld, setSpaceHeld] = useState(false)
  const hovering = useRef(false)

  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || isTextEntry(event.target)) return
      const element = svgRef.current
      const focused = element !== null && element.contains(document.activeElement)
      if (!focused && !hovering.current) return
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
  }, [svgRef])

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
          current.zoom * Math.exp(-event.deltaY * ZOOM_WHEEL_RATE),
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
    const enter = (): void => {
      hovering.current = true
    }
    const leave = (): void => {
      hovering.current = false
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    element.addEventListener('pointerenter', enter)
    element.addEventListener('pointerleave', leave)
    return () => {
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('pointerenter', enter)
      element.removeEventListener('pointerleave', leave)
    }
  }, [display, svgRef])

  return { spaceHeld }
}
