import { Maximize2, Minus, Plus, Scan } from 'lucide-react'

import type { DisplayDescriptor } from '@shared/device'
import { MAXIMUM_ZOOM, MINIMUM_ZOOM, absolutePlacement, useDashboardEditorStore } from '../dashboard-editor'
import { clamp } from '../editor/placement'
import { MAXIMUM_GRID_PX, MAXIMUM_TOLERANCE_PX, MINIMUM_GRID_PX, MINIMUM_TOLERANCE_PX, resolveGridSize, useSnapStore } from '../editor/snap-store'
import { BoardPicker } from './BoardPicker'
import { clampPan, viewForBox } from './canvas-geometry'
import { useDeviceStore } from '@/features/device/device-store'
import { t } from '@shared/ui-text'

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
        <IconButton title={t('canvas.canvasStatusBar.zoomOut')} onClick={() => zoomTo(view.zoom * 0.8)}>
          <Minus className="size-3" aria-hidden />
        </IconButton>
        <input
          aria-label={t('canvas.canvasStatusBar.zoom')}
          type="number"
          min={Math.round(MINIMUM_ZOOM * 100)}
          max={Math.round(MAXIMUM_ZOOM * 100)}
          step={5}
          value={Math.round(view.zoom * 100)}
          className="h-6 w-14 rounded-md border bg-transparent px-1 text-right"
          onChange={(event) => zoomTo((Number(event.target.value) || 100) / 100)}
        />
        <span>%</span>
        <IconButton title={t('canvas.canvasStatusBar.zoomIn')} onClick={() => zoomTo(view.zoom * 1.25)}>
          <Plus className="size-3" aria-hidden />
        </IconButton>
        <IconButton
          title={t('canvas.canvasStatusBar.fitTheWholeDisplayCmd')}
          onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })}
        >
          <Maximize2 className="size-3" aria-hidden />
        </IconButton>
        <IconButton
          title={t('canvas.canvasStatusBar.zoomToTheSelectionShift')}
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

      <label className="flex items-center gap-1" title={t('canvas.canvasStatusBar.snapToAFixedStep')}>
        <input
          type="checkbox"
          checked={snap.snapToGrid}
          onChange={(event) => snap.setSnap({ snapToGrid: event.target.checked })}
        />
        {t('canvas.canvasStatusBar.grid')}</label>
      <input
        aria-label={t('canvas.canvasStatusBar.gridStep')}
        type="number"
        min={MINIMUM_GRID_PX}
        max={MAXIMUM_GRID_PX}
        value={gridSize}
        disabled={!snap.snapToGrid}
        title={
          snap.gridSize === undefined
            ? t('canvas.canvasStatusBar.gridSizePxChosenForThis', { gridSize: gridSize })
            : t('canvas.canvasStatusBar.gridSizePx', { gridSize: gridSize })
        }
        className="h-6 w-12 rounded-md border bg-transparent px-1 disabled:opacity-40"
        onChange={(event) =>
          snap.setSnap({ gridSize: Math.max(1, Math.round(Number(event.target.value) || 1)) })
        }
      />
      <label
        className="flex items-center gap-1"
        title={t('canvas.canvasStatusBar.lineUpWithTheEdges')}
      >
        <input
          type="checkbox"
          checked={snap.snapToWidgets}
          onChange={(event) => snap.setSnap({ snapToWidgets: event.target.checked })}
        />
        {t('templates.widgetSection.widgets')}</label>
      <label
        className="flex items-center gap-1"
        title={t('canvas.canvasStatusBar.repeatAGapTheRow')}
      >
        <input
          type="checkbox"
          checked={snap.snapToSpacing}
          onChange={(event) => snap.setSnap({ snapToSpacing: event.target.checked })}
        />
        {t('canvas.canvasStatusBar.gaps')}</label>
      <label className="flex items-center gap-1" title={t('canvas.canvasStatusBar.howCloseABoxHas')}>
        {t('canvas.canvasStatusBar.reach')}<input
          aria-label={t('canvas.canvasStatusBar.snapReach')}
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
        title={t('canvas.canvasStatusBar.resizingAWidgetScalesWhat')}
      >
        <input
          type="checkbox"
          checked={snap.scaleContents}
          onChange={() => snap.toggleScaleContents()}
        />
        {t('canvas.canvasStatusBar.scaleContents')}</label>

      <span className="ml-auto flex items-center gap-3">
        {box ? (
          <span className="tabular-nums">
            {selectedIds.length > 1 ? t('canvas.canvasStatusBar.lengthSelected', { length: selectedIds.length }) : ''}
            {t('canvas.canvasStatusBar.xXYYW', { x: box.x, y: box.y, width: box.width, height: box.height })}
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
