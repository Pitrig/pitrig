import { MousePointer2, MousePointerClick, type LucideIcon } from 'lucide-react'

import type { WidgetConfiguration } from '@shared/configuration-schema'
import { atWidgetCapacity, useDashboardEditorStore } from '../dashboard-editor'
import type { CanvasTool } from '../editor/store'
import { WIDGET_ICONS } from '../inspector/icons'
import { useDeviceStore } from '@/features/device/device-store'
import { t } from '@shared/ui-text'

const TOOLS: { tool: CanvasTool; label: string; icon: LucideIcon; hint: string }[] = [
  { tool: 'select', label: t('canvas.toolPalette.select'), icon: MousePointer2, hint: t('canvas.toolPalette.pickMoveAndResizeWidgets') },
  { tool: 'text', label: t('modules.effectEditor.text'), icon: WIDGET_ICONS.text, hint: t('canvas.toolPalette.aReadingDrawnFromTelemetry') },
  { tool: 'shape', label: t('inspector.indicatorEditor.shape'), icon: WIDGET_ICONS.shape, hint: t('canvas.toolPalette.aPlateAndTheContainer') },
  { tool: 'bar', label: t('inspector.gaugeEditors.bar'), icon: WIDGET_ICONS.bar, hint: t('canvas.toolPalette.aFillingBarOverA') },
  { tool: 'arc', label: t('inspector.gaugeEditors.arc'), icon: WIDGET_ICONS.arc, hint: t('canvas.toolPalette.aRingGauge') },
  { tool: 'indicator', label: t('canvas.toolPalette.lights'), icon: WIDGET_ICONS.indicator, hint: t('canvas.toolPalette.aStripOfLamps') },
  { tool: 'graph', label: t('canvas.toolPalette.graph'), icon: WIDGET_ICONS.graph, hint: t('canvas.toolPalette.aTraceOverTime') },
  { tool: 'image', label: t('firmware.firmwarePage.image'), icon: WIDGET_ICONS.image, hint: t('canvas.toolPalette.anUploadedBitmap') },
  { tool: 'slot', label: t('canvas.toolPalette.slot'), icon: WIDGET_ICONS.slot, hint: t('canvas.toolPalette.anAreaThatSwitchesBetween') },
  { tool: 'tap_zone', label: t('canvas.toolPalette.tapZone'), icon: MousePointerClick, hint: t('canvas.toolPalette.anInvisibleRectangleThatTakes') }
]

export function ToolPalette({ enabled }: { enabled: boolean }): React.JSX.Element {
  const activeTool = useDashboardEditorStore((state) => state.activeTool)
  const setActiveTool = useDashboardEditorStore((state) => state.setActiveTool)
  const configuration = useDeviceStore((state) => state.draft)
  return (
    <div
      role="toolbar"
      aria-label={t('canvas.toolPalette.widgetTools')}
      aria-orientation="vertical"
      className="flex min-h-0 flex-none flex-col gap-1 overflow-y-auto overscroll-contain rounded-md border bg-card/60 p-1"
      style={{ scrollbarWidth: 'thin' }}
    >
      {TOOLS.map(({ tool, label, icon: Icon, hint }) => {
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
                ? t('canvas.toolPalette.theDashboardAlreadyHoldsAs', { toLowerCase: label.toLowerCase() })
                : tool === 'select'
                  ? hint
                  : t('canvas.toolPalette.labelHintDragABox', { label: label, hint: hint })
            }
            className={`flex size-8 flex-none items-center justify-center rounded-md border transition-colors disabled:opacity-30 ${
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
