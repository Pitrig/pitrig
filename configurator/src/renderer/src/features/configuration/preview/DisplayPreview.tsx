import { useEffect } from 'react'
import { Copy, Redo2, Trash2, Undo2 } from 'lucide-react'
import { BOARD_PROFILES } from '@shared/device'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDeviceStore } from '@/features/device/device-store'
import { withEditGroup } from '@/features/device/edit-group'

export function DisplayPreview(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draft = useDeviceStore((state) => state.draft)
  const pendingConfiguration = useDeviceStore((state) => state.pendingConfiguration)
  const configuration = draft ?? pendingConfiguration ?? session?.configuration
  const display = configuration
    ? BOARD_PROFILES[configuration.board]?.display
    : session?.info.display
  const selection = useDashboardEditorStore((state) => state.selection)
  const selectedIds = useDashboardEditorStore((state) => state.selectedIds)
  const select = useDashboardEditorStore((state) => state.select)
  const selectMany = useDashboardEditorStore((state) => state.selectMany)
  // The cached bitmaps change only when a package is installed or cleared,
  // which is exactly when the board starts reporting a different set of them.
  const refreshPreviewAssets = usePreviewAssetStore((state) => state.refresh)
  const installedImages = (session?.imageAssets?.images ?? [])
    .map((image) => image.name)
    .join(' ')
  useEffect(() => {
    void refreshPreviewAssets()
  }, [refreshPreviewAssets, installedImages])
  // Faces follow the *document*, not the board: the library holds them whether
  // or not anything was ever uploaded, so the canvas draws a font the moment it
  // is chosen rather than after a save.
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
  // Every id that still names a widget. The buttons act on the whole selection,
  // as the keyboard always has — a Delete button that removed one of four
  // selected widgets was the odd one out.
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
          <CardTitle>Display preview</CardTitle>
          <div className="flex flex-none gap-1">
            <Button className="size-8 p-0" variant="outline" disabled={!canUndo} title="Undo (Cmd/Ctrl+Z)" onClick={() => undo()}>
              <Undo2 className="size-4" aria-hidden />
              <span className="sr-only">Undo</span>
            </Button>
            <Button className="size-8 p-0" variant="outline" disabled={!canRedo} title="Redo (Shift+Cmd/Ctrl+Z)" onClick={() => redo()}>
              <Redo2 className="size-4" aria-hidden />
              <span className="sr-only">Redo</span>
            </Button>
            <Button
              className="size-8 p-0"
              variant="outline"
              disabled={!selectedExists}
              title="Duplicate the selection (Cmd/Ctrl+D)"
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
              <span className="sr-only">Duplicate</span>
            </Button>
            <Button
              className="size-8 p-0 text-red-400 hover:text-red-300"
              variant="outline"
              disabled={!selectedExists}
              title="Delete the selection (Delete)"
              onClick={() => {
                if (liveSelection.length > 0) deleteSelection(liveSelection)
                else select(undefined)
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        </div>
        {display ? <ArrangeToolbar /> : null}
        <CardDescription>
          {display
            ? `${configuration?.board ?? 'connected board'} · drag a tool onto the display to add a widget`
            : 'Create, load, or connect a configuration to start editing.'}
        </CardDescription>
      </CardHeader>
      {/* A size container, so the surface can be measured against the space it
          actually has rather than against a guess. The header above it grows
          and shrinks as the toolbar wraps, and the old bound subtracted a fixed
          13rem from the *viewport* height — which ignored both the wrapping and
          the fact that the card is one cell of a grid, so a square board
          overflowed the card and had its lower widgets cut off. Size
          containment also decouples this box from its content, which is what
          keeps the measurement from chasing itself. */}
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
                // The smaller of the two fits: as wide as the box, or as wide as
                // its height allows at this board's proportions.
                width: `min(100cqw, calc(100cqh * ${displayRatio}))`,
                aspectRatio: display
                  ? `${display.width} / ${display.height}`
                  : '16 / 9'
              }}
            >
              {display && configuration ? (
                <Widgets configuration={configuration} display={display} />
              ) : (
                <div className="flex size-full items-center justify-center text-sm text-zinc-600">
                  No local configuration
                </div>
              )}
            </div>
          </div>
        </div>
        {display ? <CanvasStatusBar display={display} /> : null}
      </CardContent>
    </Card>
  )
}
