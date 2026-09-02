import { Image, LayoutTemplate, PenTool, Type } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ColumnResizer, RowResizer } from '@/app/PanelResizer'
import { SubTabs, type SubTab } from '@/app/workspace/SubTabs'
import { useWorkspaceStore, type DashboardView } from '@/app/workspace/workspace-store'
import { DisplayPreview } from '@/features/configuration/preview/DisplayPreview'
import { LayersPanel } from '@/features/configuration/LayersPanel'
import { WidgetInspector } from '@/features/configuration/inspector/WidgetInspector'
import { useEditorPanelStore } from '@/features/configuration/editor/panel-store'
import { useEditorShortcuts } from '@/features/configuration/editor/use-editor-shortcuts'
import { restartBoard } from '@/features/configuration/configuration-actions'
import { useDeviceStore } from '@/features/device/device-store'
import { useDraftState } from '@/features/device/draft-state'
import { LiveApplyIndicator } from '@/features/device/LiveApplyIndicator'
import { SaveToBoardButton } from '@/features/device/save-to-board-ui'
import { useSaveToBoardStore } from '@/features/device/save-to-board-store'
import { FontsPage } from '@/features/font-library/FontsPage'
import { ImagesPage } from '@/features/image-assets/ImagesPage'
import { InsertScreenDialog } from '@/features/templates/InsertScreenDialog'
import { SaveToTemplatesButton } from '@/features/templates/SaveToTemplates'
import { TemplatesPage } from '@/features/templates/TemplatesPage'
import { t } from '@shared/ui-text'

const VIEWS: ReadonlyArray<SubTab<DashboardView>> = [
  { id: 'canvas', label: t('dashboard.dashboardWorkspace.canvas'), icon: PenTool },
  { id: 'templates', label: t('dashboard.dashboardWorkspace.templates'), icon: LayoutTemplate },
  { id: 'fonts', label: t('fonts.fontsPage.fonts'), icon: Type },
  { id: 'images', label: t('images.imagesPage.images'), icon: Image }
]

export function DashboardWorkspace(): React.JSX.Element {
  const view = useWorkspaceStore((state) => state.dashboardView)
  const setView = useWorkspaceStore((state) => state.setDashboardView)
  const rebootRequired = useDeviceStore((state) => state.rebootRequired)
  const { dirtyDocuments } = useDraftState()
  const dirty = dirtyDocuments.includes('dashboard')

  useEditorShortcuts(view === 'canvas')

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SubTabs
        label={t('dashboard.dashboardWorkspace.dashboardPages')}
        tabs={VIEWS}
        value={view}
        onChange={setView}
        actions={
          <>
            <LiveApplyIndicator />
            {rebootRequired ? (
              <Badge
                className="flex-none border-amber-500/40 bg-amber-500/15 text-amber-300"
                variant="outline"
              >
                {t('dashboard.configsPage.restartRequired')}</Badge>
            ) : dirty ? (
              <Badge
                className="flex-none border-sky-500/40 bg-sky-500/15 text-sky-300"
                variant="outline"
              >
                {t('dashboard.configsPage.modified')}</Badge>
            ) : null}
            {view === 'canvas' ? <SaveToTemplatesButton /> : null}
            <RestartBoardButton />
            <SaveToBoardButton className="flex-none" />
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
      <InsertScreenDialog />
    </div>
  )
}

function RestartBoardButton(): React.JSX.Element {
  const { connected } = useDraftState()
  const saving = useSaveToBoardStore((state) => state.running)
  return (
    <Button
      className="flex-none"
      variant="outline"
      disabled={!connected || saving}
      title={
        connected
          ? t('dashboard.dashboardWorkspace.restartTheConnectedBoard')
          : t('dashboard.dashboardWorkspace.connectABoardToRestart')
      }
      onClick={() => void restartBoard()}
    >
      {t('dashboard.dashboardWorkspace.restart')}</Button>
  )
}

function CanvasView(): React.JSX.Element {
  const inspectorWidth = useEditorPanelStore((state) => state.inspectorWidth)
  const layersHeight = useEditorPanelStore((state) => state.layersHeight)

  return (
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] overflow-hidden">
      <section className="flex min-h-0 min-w-0 justify-center overflow-hidden bg-muted/30 p-3">
        <DisplayPreview />
      </section>

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
