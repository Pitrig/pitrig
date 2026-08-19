import { ActionEditor } from './ActionEditor'
import { screenWidgetsOf, screensOf } from '@shared/configuration-access'
import type { WidgetConfiguration } from '@shared/configuration-schema'
import { completePlacement, mutateSelectedWidget, selectedWidget, useDashboardEditorStore } from '../dashboard-editor'
import { Hint } from './fields'
import { parseSelection, selectionValue } from './selection-value'
import { DashboardSection, GeometryEditor, ScreenEditor } from './section-editors'
import { ArcEditor, BarEditor, GraphEditor, ImageEditor, IndicatorEditor, ShapeEditor, SlotEditor, TextEditor } from './widget-editors'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDeviceStore } from '@/features/device/device-store'

export function WidgetInspector(): React.JSX.Element {
  const configuration = useDeviceStore((state) => state.draft)
  const selection = useDashboardEditorStore((state) => state.selection)
  const select = useDashboardEditorStore((state) => state.select)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const widget = selectedWidget(configuration, selection)
  // Everything the inspector offers belongs to the screen being edited, and the
  // subscribed index is what makes it follow a screen change.
  const screen = screensOf(configuration)[activeScreenIndex]
  const widgets = screenWidgetsOf(screen)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Widget inspector</CardTitle>
        <CardDescription>Select a widget on the display, then edit its properties.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <label className="block space-y-1 text-muted-foreground">
          <span>Selected widget</span>
          <select
            className="h-8 w-full rounded-md border bg-background px-2 text-foreground"
            value={selectionValue(selection)}
            onChange={(event) => select(parseSelection(event.target.value))}
          >
            <option value="">None</option>
            <option value="screen">Screen</option>
            {widgets.map((item, index) => (
              <option key={item.id ?? index} value={`widget:${item.id ?? ''}`}>
                {widgetLabel(item, index)}
              </option>
            ))}
          </select>
        </label>

        {!configuration ? <Hint>Fix the JSON draft before using the visual editor.</Hint> : null}
        {configuration && !selection ? <DashboardSection configuration={configuration} /> : null}
        {configuration && selection?.type === 'screen' ? (
          <ScreenEditor configuration={configuration} />
        ) : null}
        {configuration && selection?.type === 'widget' && !widget ? <Hint>Select an existing widget on the display.</Hint> : null}
        {configuration && widget && selection?.type === 'widget' ? (
          <>
            <GeometryEditor selection={selection} placement={completePlacement(widget.placement)} zIndex={widget.z_index ?? 0} />
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
              <SlotEditor widget={widget} />
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
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

// The list has to name a widget before it is selected, so each type answers
// with whatever identifies it best.
function widgetLabel(widget: WidgetConfiguration, index: number): string {
  switch (widget.type) {
    case 'shape':
      return `Shape ${index + 1}: ${widget.kind ?? 'rectangle'}`
    case 'bar':
      return `Bar ${index + 1}: ${widget.source?.binding || 'Unbound'}`
    case 'arc':
      return `Arc ${index + 1}: ${widget.source?.binding || 'Unbound'}`
    case 'indicator':
      return `Lights ${index + 1}: ${widget.source?.binding || 'Unbound'}`
    case 'graph':
      return `Graph ${index + 1}: ${widget.source?.binding || 'Unbound'}`
    case 'image':
      return `Image ${index + 1}: ${widget.image || 'Unassigned'}`
    case 'slot':
      return `Slot ${index + 1}: ${widget.pages?.length ?? 0} page(s)`
    case 'text':
      return `Text ${index + 1}: ${widget.title?.text || widget.sources?.[0]?.binding || 'Untitled'}`
  }
}

// Every gauge reads one source through one window, so they share the section
// that binds it rather than each spelling it out.
