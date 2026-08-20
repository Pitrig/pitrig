import { Maximize2, Minus, Plus, Scan } from 'lucide-react'

import type { DisplayDescriptor } from '@shared/device'
import { MAXIMUM_ZOOM, MINIMUM_ZOOM, absolutePlacement, useDashboardEditorStore } from '../dashboard-editor'
import { clamp } from '../editor/placement'
import { MAXIMUM_GRID_PX, MAXIMUM_TOLERANCE_PX, MINIMUM_GRID_PX, MINIMUM_TOLERANCE_PX, resolveGridSize, useSnapStore } from '../editor/snap-store'
import { BoardPicker } from './BoardPicker'
import { clampPan, viewForBox } from './canvas-geometry'
import { useDeviceStore } from '@/features/device/device-store'

/**
 * The row under the canvas: how it is being looked at, what a gesture will
 * stick to, what is currently selected, and which display all of it is for.
 *
 * It sits below rather than above because the header holds the things that
 * change the document and this holds the things that describe it — which also
 * keeps the header from growing a third row on a narrow window. The board is
 * the one control here that can change the document, and it is here because it
 * replaced the resolution this row used to print: the board *is* that
 * resolution, and stating one beside a control choosing the other would have
 * been the same fact written twice.
 */
export function CanvasStatusBar({ display }: { display: DisplayDescriptor }): React.JSX.Element {
  const view = useDashboardEditorStore((state) => state.view)
  const setView = useDashboardEditorStore((state) => state.setView)
  const selection = useDashboardEditorStore((state) => state.selection)
  const selectedIds = useDashboardEditorStore((state) => state.selectedIds)
  const configuration = useDeviceStore((state) => state.draft)
  const snap = useSnapStore()
  const gridSize = resolveGridSize(snap, display)
  const box =
    selection?.type === 'widget' ? absolutePlacement(configuration, selection.id) : undefined

  const zoomTo = (zoom: number): void => {
    const next = clamp(zoom, MINIMUM_ZOOM, MAXIMUM_ZOOM)
    setView({ zoom: next, ...clampPan(view, display, next) })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-1 pt-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-1">
        <IconButton title="Zoom out" onClick={() => zoomTo(view.zoom * 0.8)}>
          <Minus className="size-3" aria-hidden />
        </IconButton>
        <input
          aria-label="Zoom"
          type="number"
          min={Math.round(MINIMUM_ZOOM * 100)}
          max={Math.round(MAXIMUM_ZOOM * 100)}
          step={5}
          value={Math.round(view.zoom * 100)}
          className="h-6 w-14 rounded-md border bg-transparent px-1 text-right"
          onChange={(event) => zoomTo((Number(event.target.value) || 100) / 100)}
        />
        <span>%</span>
        <IconButton title="Zoom in" onClick={() => zoomTo(view.zoom * 1.25)}>
          <Plus className="size-3" aria-hidden />
        </IconButton>
        <IconButton
          title="Fit the whole display (Cmd/Ctrl+0)"
          onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })}
        >
          <Maximize2 className="size-3" aria-hidden />
        </IconButton>
        <IconButton
          title="Zoom to the selection (Shift+Cmd/Ctrl+0)"
          disabled={!box}
          onClick={() =>
            box &&
            setView(viewForBox(box, display, { minimum: MINIMUM_ZOOM, maximum: MAXIMUM_ZOOM }))
          }
        >
          <Scan className="size-3" aria-hidden />
        </IconButton>
      </div>

      <span className="h-4 w-px bg-border" />

      <label className="flex items-center gap-1" title="Snap to a fixed step">
        <input
          type="checkbox"
          checked={snap.snapToGrid}
          onChange={(event) => snap.setSnap({ snapToGrid: event.target.checked })}
        />
        Grid
      </label>
      <input
        aria-label="Grid step"
        type="number"
        min={MINIMUM_GRID_PX}
        max={MAXIMUM_GRID_PX}
        value={gridSize}
        disabled={!snap.snapToGrid}
        title={
          snap.gridSize === undefined
            ? `${gridSize} px, chosen for this board's display`
            : `${gridSize} px`
        }
        className="h-6 w-12 rounded-md border bg-transparent px-1 disabled:opacity-40"
        onChange={(event) =>
          snap.setSnap({ gridSize: Math.max(1, Math.round(Number(event.target.value) || 1)) })
        }
      />
      <label
        className="flex items-center gap-1"
        title="Line up with the edges and centres of the neighbouring widgets"
      >
        <input
          type="checkbox"
          checked={snap.snapToWidgets}
          onChange={(event) => snap.setSnap({ snapToWidgets: event.target.checked })}
        />
        Widgets
      </label>
      <label
        className="flex items-center gap-1"
        title="Repeat a gap the row already has, so tiles stay evenly spaced"
      >
        <input
          type="checkbox"
          checked={snap.snapToSpacing}
          onChange={(event) => snap.setSnap({ snapToSpacing: event.target.checked })}
        />
        Gaps
      </label>
      <label className="flex items-center gap-1" title="How close a box has to be before it snaps">
        Reach
        <input
          aria-label="Snap reach"
          type="number"
          min={MINIMUM_TOLERANCE_PX}
          max={MAXIMUM_TOLERANCE_PX}
          value={snap.tolerancePx}
          className="h-6 w-12 rounded-md border bg-transparent px-1"
          onChange={(event) =>
            snap.setSnap({ tolerancePx: Math.round(Number(event.target.value) || 1) })
          }
        />
      </label>

      <span className="h-4 w-px bg-border" />

      <label
        className="flex items-center gap-1"
        title="Resizing a widget scales what is inside it — a container's children, and every font size, radius and thickness with them (Shift+Cmd/Ctrl+C)"
      >
        <input
          type="checkbox"
          checked={snap.scaleContents}
          onChange={() => snap.toggleScaleContents()}
        />
        Scale contents
      </label>

      <span className="ml-auto flex items-center gap-3">
        {box ? (
          <span className="tabular-nums">
            {selectedIds.length > 1 ? `${selectedIds.length} selected · ` : ''}
            {`X ${box.x}  Y ${box.y}  W ${box.width}  H ${box.height}`}
          </span>
        ) : null}
        <BoardPicker />
      </span>
    </div>
  )
}

function IconButton({
  title,
  disabled,
  onClick,
  children
}: {
  title: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className="flex size-6 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40"
      onClick={onClick}
    >
      {children}
    </button>
  )
}
