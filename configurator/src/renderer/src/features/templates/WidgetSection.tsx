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
import { t } from '@shared/ui-text'

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
      title={t('templates.widgetSection.widgets')}
      description={t('templates.widgetSection.partsOfADashboardKept')}
    >
      {widgets.length === 0 ? (
        <EmptyState icon={<Shapes aria-hidden="true" className="size-6" />} title={t('templates.widgetSection.noWidgets')}>
          {t('templates.widgetSection.emptyBefore')}
          <b>{t('templates.dashboardSection.saveToTemplates')}</b>
          {t('templates.widgetSection.emptyAfter')}
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
                        ? t('templates.widgetSection.placeThisOnTheCanvas')
                        : t('templates.widgetSection.openADashboardFirstThere')
                    }
                    onClick={() => add(entry)}
                  >
                    <Plus aria-hidden="true" className="mr-1 size-3.5" />
                    {t('common.add')}</Button>
                  <Button
                    aria-label={t('configs.librarySection.deleteName', { name: entry.name })}
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
