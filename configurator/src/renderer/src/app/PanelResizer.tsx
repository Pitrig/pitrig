import { useEditorPanelStore } from '@/features/configuration/editor/panel-store'

/**
 * The two drag handles of the right column: one for how wide it is, one for how
 * much of it the layer list takes.
 *
 * Both work on the delta from where the drag started rather than on the pointer
 * position, so neither needs to know where in the window the panel it resizes
 * begins. The listeners are on the window because a fast drag leaves a 4-pixel
 * handle behind long before the pointer is released.
 */

function drag(onDelta: (delta: number) => void, axis: 'x' | 'y'): (event: React.PointerEvent) => void {
  return (event) => {
    event.preventDefault()
    const start = axis === 'x' ? event.clientX : event.clientY
    const previousSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    const move = (moved: PointerEvent): void => {
      onDelta((axis === 'x' ? moved.clientX : moved.clientY) - start)
    }
    const release = (): void => {
      document.body.style.userSelect = previousSelect
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', release)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', release)
  }
}

export function ColumnResizer(): React.JSX.Element {
  const setInspectorWidth = useEditorPanelStore((state) => state.setInspectorWidth)
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the property panel"
      className="w-1 flex-none cursor-col-resize hover:bg-muted"
      onPointerDown={(event: React.PointerEvent) => {
        // The panel is to the right of the handle, so it grows as the pointer
        // moves left.
        const width = useEditorPanelStore.getState().inspectorWidth
        drag((delta) => setInspectorWidth(width - delta), 'x')(event)
      }}
    />
  )
}

export function RowResizer(): React.JSX.Element {
  const setLayersHeight = useEditorPanelStore((state) => state.setLayersHeight)
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the layer list"
      className="-my-1 h-2 flex-none cursor-row-resize"
      onPointerDown={(event: React.PointerEvent) => {
        const height = useEditorPanelStore.getState().layersHeight
        drag((delta) => setLayersHeight(height + delta), 'y')(event)
      }}
    />
  )
}
