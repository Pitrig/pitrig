import { Image, LayoutTemplate, PenTool, Type } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ColumnResizer, RowResizer } from '@/app/PanelResizer'
import { SubTabs, type SubTab } from '@/app/workspace/SubTabs'
import { useWorkspaceStore, type DashboardView } from '@/app/workspace/workspace-store'
import { DisplayPreview } from '@/features/configuration/preview/DisplayPreview'
import { LayersPanel } from '@/features/configuration/LayersPanel'
import { WidgetInspector } from '@/features/configuration/inspector/WidgetInspector'
import { useEditorPanelStore } from '@/features/configuration/editor/panel-store'
import { useEditorShortcuts } from '@/features/configuration/editor/use-editor-shortcuts'
import { useDeviceStore } from '@/features/device/device-store'
import { useDraftState } from '@/features/device/draft-state'
import { LiveApplyIndicator } from '@/features/device/LiveApplyIndicator'
import { SaveToBoardButton } from '@/features/device/save-to-board-ui'
import { FontsPage } from '@/features/font-library/FontsPage'
import { ImagesPage } from '@/features/image-assets/ImagesPage'
import { InsertScreenDialog } from '@/features/templates/InsertScreenDialog'
import { SaveToTemplatesButton } from '@/features/templates/SaveToTemplates'
import { TemplatesPage } from '@/features/templates/TemplatesPage'

/**
 * The dashboard workspace: the canvas, and the three libraries it draws from.
 *
 * All four answer the same question — what this dashboard is made of — so they
 * are pages of one workspace rather than four entries on the rail. Save to
 * board sits in the strip above them because it applies to the document as a
 * whole, not to whichever of the four is on screen.
 */

const VIEWS: ReadonlyArray<SubTab<DashboardView>> = [
  { id: 'canvas', label: 'Canvas', icon: PenTool },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'fonts', label: 'Fonts', icon: Type },
  { id: 'images', label: 'Images', icon: Image }
]

export function DashboardWorkspace(): React.JSX.Element {
  const view = useWorkspaceStore((state) => state.dashboardView)
  const setView = useWorkspaceStore((state) => state.setDashboardView)
  const rebootRequired = useDeviceStore((state) => state.rebootRequired)
  const { dirty } = useDraftState()

  // The canvas keys act on the selected widget, so they are live only while the
  // canvas is the page being looked at.
  useEditorShortcuts(view === 'canvas')

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SubTabs
        label="Dashboard pages"
        tabs={VIEWS}
        value={view}
        onChange={setView}
        actions={
          <>
            <LiveApplyIndicator />
            {rebootRequired ? (
              <Badge
                className="border-amber-500/40 bg-amber-500/15 text-amber-300"
                variant="outline"
              >
                Restart required
              </Badge>
            ) : dirty ? (
              <Badge className="border-sky-500/40 bg-sky-500/15 text-sky-300" variant="outline">
                Modified
              </Badge>
            ) : null}
            {/* Only on the canvas: the other pages have no selection to read,
                and a button whose meaning changes with the page is worse than a
                button that is not there. */}
            {view === 'canvas' ? <SaveToTemplatesButton /> : null}
            <SaveToBoardButton />
          </>
        }
      />
      {view === 'canvas' ? (
        <CanvasView />
      ) : view === 'templates' ? (
        <TemplatesPage />
      ) : view === 'fonts' ? (
        <FontsPage />
      ) : (
        <ImagesPage />
      )}
      {/* Mounted for the workspace rather than for the canvas: the picker is
          opened from the canvas menu and outlives the click that opened it. */}
      <InsertScreenDialog />
    </div>
  )
}

function CanvasView(): React.JSX.Element {
  const inspectorWidth = useEditorPanelStore((state) => state.inspectorWidth)
  const layersHeight = useEditorPanelStore((state) => state.layersHeight)

  return (
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] overflow-hidden">
      {/* No `items-center`: the preview card fills the cell, so its content
          box has a height of its own. Hugging its content instead made the
          card's height depend on the surface and the surface's size depend on
          the card — the circular case, which collapses. */}
      <section className="flex min-h-0 min-w-0 justify-center overflow-hidden bg-muted/30 p-3">
        <DisplayPreview />
      </section>

      {/* Two panes rather than one scrolling column: the inspector owns its
          own scroll, so picking another widget can put it back at the top
          without dragging the layer list along with it. */}
      <div className="flex min-h-0" style={{ width: inspectorWidth }}>
        <ColumnResizer />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 border-l p-3">
          <div className="min-h-0 flex-none" style={{ height: layersHeight }}>
            <LayersPanel />
          </div>
          <RowResizer />
          <div className="min-h-0 flex-1">
            <WidgetInspector />
          </div>
        </div>
      </div>
    </div>
  )
}
