import { Plus, Shapes, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState, PageSection } from '@/app/workspace/PageShell'
import { useWorkspaceStore } from '@/app/workspace/workspace-store'
import { useDashboardEditorStore } from '@/features/configuration/dashboard-editor'
import { useDeviceStore } from '@/features/device/device-store'
import type { WidgetTemplateSummary } from '@shared/templates'
import { TemplateCard } from './TemplateCard'
import { NO_TEMPLATES, useTemplatesStore } from './templates-store'
import { WidgetThumbnail } from './WidgetThumbnail'

/**
 * Parts of dashboards, for reuse inside one.
 *
 * Pressing Add does not drop the widget somewhere and leave the author to find
 * it: it hands the fragment to the canvas, which then follows the pointer with
 * it until a click says where it goes.
 */
export function WidgetSection({
  busy,
  onDelete
}: {
  busy: boolean
  onDelete: (entry: WidgetTemplateSummary) => void
}): React.JSX.Element {
  const widgets = useTemplatesStore((state) => state.library ?? NO_TEMPLATES).widgets
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  const beginInsert = useDashboardEditorStore((state) => state.beginInsert)
  const setDashboardView = useWorkspaceStore((state) => state.setDashboardView)

  const add = (entry: WidgetTemplateSummary): void => {
    beginInsert({ widget: entry.widget, label: entry.name })
    setDashboardView('canvas')
  }

  return (
    <PageSection
      title="Widgets"
      description="Parts of a dashboard kept for reuse. A container brings everything inside it."
    >
      {widgets.length === 0 ? (
        <EmptyState icon={<Shapes aria-hidden="true" className="size-6" />} title="No widgets">
          Select a widget on the canvas and press <b>Save to templates</b>. A container saves its
          whole cluster, which is how a rev-counter with its lights becomes one entry.
        </EmptyState>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {widgets.map((entry) => (
            <TemplateCard
              key={entry.id}
              name={entry.name}
              description={entry.description}
              meta={`${entry.width} × ${entry.height}${entry.widgetCount > 1 ? ` · ${entry.widgetCount} widgets` : ''}`}
              preview={<WidgetThumbnail widget={entry.widget} className="size-full" />}
              actions={
                <>
                  <Button
                    className="h-7 px-2"
                    variant="outline"
                    disabled={busy || !hasLocalDraft}
                    title={
                      hasLocalDraft
                        ? 'Place this on the canvas'
                        : 'Open a dashboard first — there is nothing to place it on'
                    }
                    onClick={() => add(entry)}
                  >
                    <Plus aria-hidden="true" className="mr-1 size-3.5" />
                    Add
                  </Button>
                  <Button
                    aria-label={`Delete ${entry.name}`}
                    className="h-7 px-2 text-red-400 hover:text-red-300"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onDelete(entry)}
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                  </Button>
                </>
              }
            />
          ))}
        </ul>
      )}
    </PageSection>
  )
}
