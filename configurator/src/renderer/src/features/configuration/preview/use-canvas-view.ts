import { useEffect, useState, type RefObject } from 'react'
import type { DisplayDescriptor } from '@shared/device'
import { clamp } from '../editor/placement'
import { isTextEntry } from '../editor/keyboard'
import { MAXIMUM_ZOOM, MINIMUM_ZOOM, useDashboardEditorStore } from '../dashboard-editor'
import { clampPan, logicalPoint, viewportScale } from './canvas-geometry'

/**
 * The viewport half of the canvas: wheel zoom and scroll, plus the held Space
 * that turns the left button into a pan. Gestures read the result; nothing
 * here touches the document.
 */
export function useCanvasView(
  svgRef: RefObject<SVGSVGElement | null>,
  display: DisplayDescriptor
): { spaceHeld: boolean } {
  // Space is the pan key every canvas uses, and it has to be a held state
  // rather than a modifier on the event: the press happens before the drag.
  const [spaceHeld, setSpaceHeld] = useState(false)

  // Space pans, so the canvas has to know it is held before anything is
  // dragged. Left alone while a field has focus, where a space is a space.
  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || isTextEntry(event.target)) return
      event.preventDefault()
      setSpaceHeld(true)
    }
    const up = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    // A window that loses focus mid-press never sees the release.
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

  // Wheel handling is a native listener rather than a React prop because it has
  // to be able to refuse the browser's own zoom and scroll, and React registers
  // wheel passively at the root, where preventDefault does nothing.
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
        // Zooming at the pointer keeps whatever is under it under it, which is
        // what makes magnifying a corner of the display usable at all.
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
