import { useEffect } from 'react'
import { allWidgetsOf } from '../../../../shared/configuration-access'
import type { FontSpec } from '../../../../shared/configuration-schema'
import { BOARD_PROFILES } from '../../../../shared/device'
import { type WidgetSelection, MAXIMUM_TEXT_WIDGETS, addArcWidget, addBarWidget, addGraphWidget, addImageWidget, addIndicatorWidget, addShapeWidget, addSlotWidget, addTextWidget, deleteWidget, draftValueFont, duplicateWidget, findWidget, useDashboardEditorStore } from './dashboard-editor'
import { usePreviewAssetStore } from './preview-assets'
import { Widgets } from './preview/PreviewCanvas'
import { ArrangeToolbar } from './preview/PreviewChrome'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDeviceStore } from '@/features/device/device-store'

/**
 * The widget kinds the toolbar can add. Each entry differs only in its label,
 * its button width, and the defaults its kind needs, so the buttons are one
 * loop rather than seven copies — adding a widget type adds a row here.
 */
const ADD_WIDGET_BUTTONS: {
  label: string
  width: string
  add: (
    display: { width: number; height: number },
    defaults: { font?: FontSpec; image?: string }
  ) => WidgetSelection | undefined
}[] = [
  { label: 'Text', width: 'w-20', add: (display, { font }) => addTextWidget(display, font) },
  { label: 'Shape', width: 'w-20', add: (display) => addShapeWidget(display) },
  { label: 'Bar', width: 'w-20', add: (display) => addBarWidget(display) },
  { label: 'Arc', width: 'w-20', add: (display) => addArcWidget(display) },
  { label: 'Lights', width: 'w-24', add: (display) => addIndicatorWidget(display) },
  { label: 'Graph', width: 'w-20', add: (display) => addGraphWidget(display) },
  { label: 'Image', width: 'w-20', add: (display, { image }) => addImageWidget(display, image) },
  { label: 'Slot', width: 'w-20', add: (display) => addSlotWidget(display) }
]

export function DisplayPreview(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draft = useDeviceStore((state) => state.draft)
  const pendingConfiguration = useDeviceStore((state) => state.pendingConfiguration)
  const configuration = draft ?? pendingConfiguration ?? session?.configuration
  const display = configuration
    ? BOARD_PROFILES[configuration.board]?.display
    : session?.info.display
  const selection = useDashboardEditorStore((state) => state.selection)
  const select = useDashboardEditorStore((state) => state.select)
  // The cached faces and bitmaps change only when a package is installed or
  // cleared, which is exactly when the board starts reporting a different set
  // of them. Reading them at all is what lets the canvas draw with the font the
  // board rasterizes instead of a stand-in.
  const refreshPreviewAssets = usePreviewAssetStore((state) => state.refresh)
  const installedAssets = [
    ...(session?.fontAssets?.families ?? []),
    ...(session?.imageAssets?.images ?? []).map((image) => image.name)
  ].join(' ')
  useEffect(() => {
    void refreshPreviewAssets()
  }, [refreshPreviewAssets, installedAssets])
  const canUndo = useDeviceStore((state) => state.past.length > 0)
  const canRedo = useDeviceStore((state) => state.future.length > 0)
  const undo = useDeviceStore((state) => state.undo)
  const redo = useDeviceStore((state) => state.redo)
  // A new reading takes the font the dashboard already draws with. Reading it
  // from the connected board instead meant a widget landed in whichever family
  // happened to be installed first, at a fixed size unrelated to its
  // neighbours — and with no board connected it got no font at all, which the
  // validator then rejected the whole document over.
  const defaultFont = draftValueFont(configuration, session?.fontAssets?.families[0])
  // Widget storage is a dashboard-wide pool, so the cap counts every screen.
  const textWidgetCount = allWidgetsOf(configuration).filter(
    (widget) => widget.type === 'text'
  ).length
  const selectedExists =
    selection?.type === 'widget' && Boolean(findWidget(configuration, selection.id))
  const displayRatio = display
    ? display.width / display.height
    : 16 / 9
  const surfaceMaximumWidth = `max(8rem, calc((100vh - 13rem) * ${displayRatio}))`

  return (
    <Card
      className="flex max-h-full w-full flex-col bg-background/70"
      style={{ maxWidth: `calc(${surfaceMaximumWidth} + 2rem)` }}
    >
      <CardHeader className="flex-none py-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Display preview</CardTitle>
          <div className="flex flex-wrap justify-end gap-2">
            {ADD_WIDGET_BUTTONS.map(({ label, width, add }) => {
              const atCapacity = label === 'Text' && textWidgetCount >= MAXIMUM_TEXT_WIDGETS
              return (
                <Button
                  key={label}
                  className={`h-8 ${width}`}
                  variant="outline"
                  disabled={!configuration || atCapacity}
                  title={atCapacity ? `Maximum of ${MAXIMUM_TEXT_WIDGETS} text widgets reached.` : undefined}
                  onClick={() => {
                    if (!display) return
                    const added = add(display, { font: defaultFont, image: session?.imageAssets?.images[0]?.name })
                    if (added) select(added)
                  }}
                >
                  + {label}
                </Button>
              )
            })}
            <Button className="h-8 w-20" variant="outline" disabled={!selectedExists} title="Duplicate the selected widget (Cmd/Ctrl+D)" onClick={() => {
              if (!display || !selection) return
              const added = duplicateWidget(selection, display)
              if (added) select(added)
            }}>Duplicate</Button>
            <Button className="h-8 w-10" variant="outline" disabled={!canUndo} title="Undo (Cmd/Ctrl+Z)" onClick={() => undo()}>↶</Button>
            <Button className="h-8 w-10" variant="outline" disabled={!canRedo} title="Redo (Shift+Cmd/Ctrl+Z)" onClick={() => redo()}>↷</Button>
            <Button className="h-8 w-20" variant="outline" disabled={!selectedExists} title="Delete the selected widget (Delete)" onClick={() => {
              if (!selection) return
              if (deleteWidget(selection)) select(undefined)
            }}>Delete</Button>
          </div>
        </div>
        {display ? <ArrangeToolbar display={display} /> : null}
        <CardDescription>
          {display
            ? `${display.width} × ${display.height} logical pixels · ${configuration?.board ?? 'connected board'}`
            : 'Create, load, or connect a configuration to start editing.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-4 pb-4">
        <div
          className="relative mx-auto w-full max-w-full overflow-hidden rounded-md border bg-black shadow-2xl"
          style={{
            maxWidth: surfaceMaximumWidth,
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
      </CardContent>
    </Card>
  )
}
