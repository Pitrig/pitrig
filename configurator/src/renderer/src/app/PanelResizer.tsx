import { useEffect, useRef } from 'react'

import { useEditorPanelStore } from '@/features/configuration/editor/panel-store'
import { t } from '@shared/ui-text'

type DragStart = (event: React.PointerEvent<HTMLDivElement>, onDelta: (delta: number) => void) => void

function useDrag(axis: 'x' | 'y'): DragStart {
  const stop = useRef<(() => void) | undefined>(undefined)

  useEffect(() => () => stop.current?.(), [])

  return (event, onDelta) => {
    if (stop.current) return
    event.preventDefault()
    const element = event.currentTarget
    const pointerId = event.pointerId
    const start = axis === 'x' ? event.clientX : event.clientY
    const previousSelect = document.body.style.userSelect
    const release = (): void => {
      stop.current = undefined
      document.body.style.userSelect = previousSelect
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', release)
      element.removeEventListener('pointercancel', release)
      element.removeEventListener('lostpointercapture', release)
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
    }
    const move = (moved: PointerEvent): void => {
      if (moved.pointerId !== pointerId) return
      if (moved.buttons === 0) return release()
      onDelta((axis === 'x' ? moved.clientX : moved.clientY) - start)
    }
    document.body.style.userSelect = 'none'
    stop.current = release
    element.setPointerCapture(pointerId)
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', release)
    element.addEventListener('pointercancel', release)
    element.addEventListener('lostpointercapture', release)
  }
}

export function ColumnResizer(): React.JSX.Element {
  const setInspectorWidth = useEditorPanelStore((state) => state.setInspectorWidth)
  const drag = useDrag('x')
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('app.panelResizer.resizeThePropertyPanel')}
      className="w-1 flex-none cursor-col-resize hover:bg-muted"
      onPointerDown={(event) => {
        const width = useEditorPanelStore.getState().inspectorWidth
        drag(event, (delta) => setInspectorWidth(width - delta))
      }}
    />
  )
}

export function RowResizer(): React.JSX.Element {
  const setLayersHeight = useEditorPanelStore((state) => state.setLayersHeight)
  const drag = useDrag('y')
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={t('app.panelResizer.resizeTheLayerList')}
      className="-my-1 h-2 flex-none cursor-row-resize"
      onPointerDown={(event) => {
        const height = useEditorPanelStore.getState().layersHeight
        drag(event, (delta) => setLayersHeight(height + delta))
      }}
    />
  )
}
