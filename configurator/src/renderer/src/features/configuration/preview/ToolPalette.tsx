import { MousePointer2, MousePointerClick, type LucideIcon } from 'lucide-react'

import type { WidgetConfiguration } from '@shared/configuration-schema'
import { atWidgetCapacity, useDashboardEditorStore } from '../dashboard-editor'
import type { CanvasTool } from '../editor/store'
import { WIDGET_ICONS } from '../inspector/icons'
import { useDeviceStore } from '@/features/device/device-store'

/**
 * The tools, down the left edge of the canvas.
 *
 * A tool is picked and then a box is drawn, which is how a widget ends up
 * exactly where it belongs instead of in the middle of the display waiting to
 * be dragged into place. Eight buttons labelled "+ Text" used to take a whole
 * row of the card's header and still said nothing about where the widget would
 * land; here the choice sits beside the surface it acts on.
 *
 * Deliberately without keyboard shortcuts: nine single-letter bindings in a
 * window whose panels are full of fields is a trap, and the same nine kinds are
 * a right-click away on the canvas itself.
 */

const TOOLS: { tool: CanvasTool; label: string; icon: LucideIcon; hint: string }[] = [
  { tool: 'select', label: 'Select', icon: MousePointer2, hint: 'Pick, move and resize widgets' },
  { tool: 'text', label: 'Text', icon: WIDGET_ICONS.text, hint: 'A reading, drawn from telemetry' },
  { tool: 'shape', label: 'Shape', icon: WIDGET_ICONS.shape, hint: 'A plate, and the container other widgets go inside' },
  { tool: 'bar', label: 'Bar', icon: WIDGET_ICONS.bar, hint: 'A filling bar over a value window' },
  { tool: 'arc', label: 'Arc', icon: WIDGET_ICONS.arc, hint: 'A ring gauge' },
  { tool: 'indicator', label: 'Lights', icon: WIDGET_ICONS.indicator, hint: 'A strip of lamps' },
  { tool: 'graph', label: 'Graph', icon: WIDGET_ICONS.graph, hint: 'A trace over time' },
  { tool: 'image', label: 'Image', icon: WIDGET_ICONS.image, hint: 'An uploaded bitmap' },
  { tool: 'slot', label: 'Slot', icon: WIDGET_ICONS.slot, hint: 'An area that switches between pages' },
  { tool: 'tap_zone', label: 'Tap zone', icon: MousePointerClick, hint: 'An invisible rectangle that takes a tap' }
]

export function ToolPalette({ enabled }: { enabled: boolean }): React.JSX.Element {
  const activeTool = useDashboardEditorStore((state) => state.activeTool)
  const setActiveTool = useDashboardEditorStore((state) => state.setActiveTool)
  const configuration = useDeviceStore((state) => state.draft)
  return (
    <div
      role="toolbar"
      aria-label="Widget tools"
      aria-orientation="vertical"
      className="flex flex-none flex-col gap-1 rounded-md border bg-card/60 p-1"
    >
      {TOOLS.map(({ tool, label, icon: Icon, hint }) => {
        // A tap zone is a shape, so it shares the shape pool and its cap.
        const kind: WidgetConfiguration['type'] | undefined =
          tool === 'select' ? undefined : tool === 'tap_zone' ? 'shape' : tool
        const full = kind !== undefined && atWidgetCapacity(configuration, kind)
        const active = activeTool === tool
        return (
          <button
            key={tool}
            type="button"
            aria-pressed={active}
            disabled={!enabled || full}
            title={
              full
                ? `The dashboard already holds as many ${label.toLowerCase()} widgets as the board has room for.`
                : tool === 'select'
                  ? hint
                  : `${label} — ${hint}. Drag a box on the display, or click to place one.`
            }
            className={`flex size-8 items-center justify-center rounded-md border transition-colors disabled:opacity-30 ${
              active
                ? 'border-sky-500 bg-sky-500/15 text-sky-300'
                : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            onClick={() => setActiveTool(tool)}
          >
            <Icon className="size-4" aria-hidden />
            <span className="sr-only">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
