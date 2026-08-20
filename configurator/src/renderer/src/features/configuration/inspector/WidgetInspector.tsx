import { useEffect, useRef, useState } from 'react'
import { WIDGET_ID_CAPACITY, type WidgetConfiguration } from '@shared/configuration-schema'
import { ActionEditor } from './ActionEditor'
import { completePlacement, mutateSelectedWidget, renameWidget, selectedWidget, useDashboardEditorStore } from '../dashboard-editor'
import { Hint } from './fields'
import { HINTS } from './hints'
import { WIDGET_ICONS } from './icons'
import { InfoHint } from './InfoHint'
import { DashboardSection, GeometryEditor, ScreenEditor } from './section-editors'
import { ArcEditor, BarEditor, GraphEditor, ImageEditor, IndicatorEditor, ShapeEditor, SlotEditor, TextEditor } from './widget-editors'
import { Card } from '@/components/ui/card'
import { useDeviceStore } from '@/features/device/device-store'

/**
 * The properties of whatever is selected, as a list of folding groups in one
 * order for every widget type: what it reads, what it is, what it says, how it
 * looks, what a value does to it, what a tap does, and where it sits.
 *
 * The panel scrolls on its own rather than with the column above it, and it
 * starts from the top for each new selection: a scroll position belongs to the
 * widget it was scrolled for, and carrying it into the next one lands the author
 * halfway down a different set of properties.
 *
 * There is no widget picker here. The layer list and the canvas are the two
 * places a widget is chosen, and a third one only ever disagreed with them.
 */
export function WidgetInspector(): React.JSX.Element {
  const configuration = useDeviceStore((state) => state.draft)
  const selection = useDashboardEditorStore((state) => state.selection)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const widget = selectedWidget(configuration, selection)
  const body = useRef<HTMLDivElement>(null)

  // Keyed on what is selected rather than on the widget object, which is a new
  // one after every edit — scrolling to the top on each keystroke is exactly
  // what this must not do.
  const selected = selection?.type === 'widget' ? `widget:${selection.id}` : (selection?.type ?? 'none')
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0
  }, [selected])

  return (
    <Card className="flex h-full min-h-0 flex-col">
      {/* Without a document there is nothing to be the properties of, so the
          panel is an empty frame rather than a header over a message. It keeps
          its place in the column so the layout does not move once one is
          loaded. */}
      {configuration ? (
        <header className="flex-none border-b px-3 py-2 text-xs">
          {widget ? (
            <WidgetIdentity key={widget.id ?? ''} widget={widget} />
          ) : (
            <span className="font-semibold">
              {selection?.type === 'screen' ? `Screen ${activeScreenIndex + 1}` : 'Dashboard'}
            </span>
          )}
        </header>
      ) : null}
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 text-xs">
        {configuration && !selection ? <DashboardSection configuration={configuration} /> : null}
        {configuration && selection?.type === 'screen' ? (
          <ScreenEditor configuration={configuration} />
        ) : null}
        {configuration && selection?.type === 'widget' && !widget ? (
          <Hint>Select an existing widget on the display.</Hint>
        ) : null}
        {configuration && widget && selection?.type === 'widget' ? (
          <>
            {widget.type === 'bar' ? (
              <BarEditor selection={selection} widget={widget} />
            ) : widget.type === 'arc' ? (
              <ArcEditor selection={selection} widget={widget} />
            ) : widget.type === 'indicator' ? (
              <IndicatorEditor selection={selection} widget={widget} />
            ) : widget.type === 'graph' ? (
              <GraphEditor selection={selection} widget={widget} />
            ) : widget.type === 'image' ? (
              <ImageEditor selection={selection} widget={widget} />
            ) : widget.type === 'shape' ? (
              <ShapeEditor selection={selection} widget={widget} />
            ) : widget.type === 'slot' ? (
              <SlotEditor selection={selection} widget={widget} />
            ) : (
              <TextEditor selection={selection} widget={widget} />
            )}
            {/* A slot's tap already means "next page", so it carries no action
                and the device refuses one that does. */}
            {widget.type === 'slot' ? null : (
              <ActionEditor
                configuration={configuration}
                action={widget.action}
                disabledReason={undefined}
                onChange={(action) =>
                  mutateSelectedWidget(selection, (target) => {
                    if (action) target.action = action
                    else delete target.action
                  })
                }
              />
            )}
            <GeometryEditor
              selection={selection}
              type={widget.type}
              placement={completePlacement(widget.placement)}
              zIndex={widget.z_index}
            />
          </>
        ) : null}
      </div>
    </Card>
  )
}

/**
 * What is being edited: its kind, and the name everything else refers to it by.
 * A rename that would collide or overflow is refused rather than adjusted, and
 * the field reverts so the refusal is visible instead of the edit vanishing.
 */
function WidgetIdentity({ widget }: { widget: WidgetConfiguration }): React.JSX.Element {
  const Icon = WIDGET_ICONS[widget.type]
  const id = widget.id ?? ''
  // Keyed on the committed id by its caller, so a rename elsewhere remounts
  // this instead of being synced into it.
  const [draft, setDraft] = useState(id)
  const [rejected, setRejected] = useState(false)
  const commit = (): void => {
    if (draft === id) return
    if (!renameWidget(id, draft)) {
      setRejected(true)
      setDraft(id)
    }
  }
  return (
    <div className="flex items-center gap-2">
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <input
        aria-label="Widget name"
        value={draft}
        maxLength={WIDGET_ID_CAPACITY - 1}
        className={`h-7 min-w-0 flex-1 rounded-md border bg-background px-2 font-medium text-foreground ${rejected ? 'border-red-500' : ''}`}
        onChange={(event) => {
          setDraft(event.target.value)
          setRejected(false)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
      />
      <span className="flex-none text-muted-foreground">{widget.type}</span>
      <InfoHint text={HINTS.widget.id} label="Widget name" />
    </div>
  )
}
