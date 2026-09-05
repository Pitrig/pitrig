import { useEffect, useState } from 'react'
import { Copy, Redo2, Trash2, Undo2 } from 'lucide-react'
import { BOARD_PROFILES, type PitrigBoardId } from '@shared/device'
import { useWorkspaceStore } from '@/app/workspace/workspace-store'
import {
  createConfiguration,
  openConfigurationFile
} from '@/features/configuration/configuration-actions'
import { BoardChoice } from './BoardPicker'
import { duplicateWidget, findWidget, useDashboardEditorStore } from '../dashboard-editor'
import { documentFonts } from '@shared/document-fonts'
import { useFontFaceStore } from '@/features/font-library/font-face-store'
import { deleteSelection } from './menu-entries'
import { usePreviewAssetStore } from './preview-assets'
import { Widgets } from './PreviewCanvas'
import { ArrangeToolbar } from './PreviewChrome'
import { CanvasStatusBar } from './CanvasStatusBar'
import { ToolPalette } from './ToolPalette'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDeviceStore } from '@/features/device/device-store'
import { withEditGroup } from '@/features/device/edit-group'
import { t } from '@shared/ui-text'

export function DisplayPreview(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draft = useDeviceStore((state) => state.draft)
  const activeConfiguration = useDeviceStore((state) => state.activeConfiguration)
  const offlineBoard = useDeviceStore((state) => state.offlineBoard)
  const configuration = draft ?? activeConfiguration ?? session?.configuration
  const display = configuration
    ? BOARD_PROFILES[configuration.board]?.display
    : (session?.info.display ??
      (offlineBoard ? BOARD_PROFILES[offlineBoard]?.display : undefined))
  const selection = useDashboardEditorStore((state) => state.selection)
  const selectedIds = useDashboardEditorStore((state) => state.selectedIds)
  const select = useDashboardEditorStore((state) => state.select)
  const selectMany = useDashboardEditorStore((state) => state.selectMany)
  const refreshPreviewAssets = usePreviewAssetStore((state) => state.refresh)
  const installedImages = (session?.imageAssets?.images ?? [])
    .map((image) => image.name)
    .join(' ')
  useEffect(() => {
    void refreshPreviewAssets()
  }, [refreshPreviewAssets, installedImages])
  const ensureFaces = useFontFaceStore((state) => state.ensureFaces)
  const documentFamilies = [
    ...new Set(
      documentFonts(configuration)
        .map((font) => font?.family)
        .filter((family): family is string => Boolean(family))
    )
  ]
    .sort()
    .join(' ')
  useEffect(() => {
    void ensureFaces(documentFamilies ? documentFamilies.split(' ') : [])
  }, [ensureFaces, documentFamilies])
  const canUndo = useDeviceStore((state) => state.past.length > 0)
  const canRedo = useDeviceStore((state) => state.future.length > 0)
  const undo = useDeviceStore((state) => state.undo)
  const redo = useDeviceStore((state) => state.redo)
  const liveSelection = selectedIds.filter((id) => findWidget(configuration, id))
  const selectedExists =
    liveSelection.length > 0 ||
    (selection?.type === 'widget' && Boolean(findWidget(configuration, selection.id)))
  const displayRatio = display
    ? display.width / display.height
    : 16 / 9

  return (
    <Card className="flex h-full w-full flex-col bg-background/70">
      <CardHeader className="flex-none gap-2 py-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t('canvas.displayPreview.displayPreview')}</CardTitle>
          <div className="flex flex-none gap-1">
            <Button className="size-8 p-0" variant="outline" disabled={!canUndo} title={t('canvas.displayPreview.undoCmdCtrlZ')} onClick={() => undo()}>
              <Undo2 className="size-4" aria-hidden />
              <span className="sr-only">{t('canvas.displayPreview.undo')}</span>
            </Button>
            <Button className="size-8 p-0" variant="outline" disabled={!canRedo} title={t('canvas.displayPreview.redoShiftCmdCtrlZ')} onClick={() => redo()}>
              <Redo2 className="size-4" aria-hidden />
              <span className="sr-only">{t('canvas.displayPreview.redo')}</span>
            </Button>
            <Button
              className="size-8 p-0"
              variant="outline"
              disabled={!selectedExists}
              title={t('canvas.displayPreview.duplicateTheSelectionCmdCtrl')}
              onClick={() => {
                if (!display) return
                withEditGroup(() => {
                  const added = liveSelection
                    .map((id) => duplicateWidget({ type: 'widget', id }, display))
                    .filter((entry): entry is { type: 'widget'; id: string } => entry?.type === 'widget')
                  if (added.length > 0) selectMany(added.map((entry) => entry.id))
                })
              }}
            >
              <Copy className="size-4" aria-hidden />
              <span className="sr-only">{t('canvas.displayPreview.duplicate')}</span>
            </Button>
            <Button
              className="size-8 p-0 text-red-400 hover:text-red-300"
              variant="outline"
              disabled={!selectedExists}
              title={t('canvas.displayPreview.deleteTheSelectionDelete')}
              onClick={() => {
                if (liveSelection.length > 0) deleteSelection(liveSelection)
                else select(undefined)
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              <span className="sr-only">{t('common.delete')}</span>
            </Button>
          </div>
        </div>
        {configuration ? <ArrangeToolbar /> : null}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4">
        <div className="flex min-h-0 flex-1 gap-2">
          <ToolPalette enabled={Boolean(display && configuration)} />
          <div
            className="flex min-h-0 min-w-0 flex-1 items-center justify-center"
            style={{ containerType: 'size' }}
          >
            <div
              className="relative overflow-hidden rounded-md border bg-black shadow-2xl"
              style={{
                width: `min(100cqw, calc(100cqh * ${displayRatio}))`,
                aspectRatio: display
                  ? `${display.width} / ${display.height}`
                  : '16 / 9'
              }}
            >
              {display && configuration ? (
                <Widgets configuration={configuration} display={display} />
              ) : (
                <EmptyCanvas />
              )}
            </div>
          </div>
        </div>
        {display && configuration ? <CanvasStatusBar display={display} /> : null}
      </CardContent>
    </Card>
  )
}


function EmptyCanvas(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const offlineBoard = useDeviceStore((state) => state.offlineBoard)
  const setOfflineBoard = useDeviceStore((state) => state.setOfflineBoard)
  const setDashboardView = useWorkspaceStore((state) => state.setDashboardView)
  const [message, setMessage] = useState<string>()
  const board = session?.info.boardId ?? offlineBoard ?? ''

  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-sm text-zinc-400">{t('canvas.displayPreview.noDashboardOpen')}</p>
      {session ? (
        <p className="max-w-xs text-[11px] text-zinc-500">
          {t('canvas.displayPreview.authoringForTheConnectedBoardid', { boardId: session.info.boardId })}
        </p>
      ) : (
        <BoardChoice
          value={board as PitrigBoardId | ''}
          onChange={(next) => {
            setOfflineBoard(next || undefined)
            setMessage(undefined)
          }}
        />
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          disabled={!board}
          title={board ? undefined : t('canvas.displayPreview.chooseABoardFirst')}
          onClick={() => setMessage(createConfiguration(board as PitrigBoardId).message)}
        >
          {t('canvas.displayPreview.newDashboard')}</Button>
        <Button
          variant="outline"
          onClick={() => void openConfigurationFile().then((result) => setMessage(result?.message))}
        >
          {t('modules.noConfiguration.openFile')}</Button>
        <Button variant="outline" onClick={() => setDashboardView('templates')}>
          {t('canvas.displayPreview.browseTemplates')}</Button>
      </div>
      {message ? <p className="max-w-xs text-[11px] text-zinc-500">{message}</p> : null}
    </div>
  )
}
