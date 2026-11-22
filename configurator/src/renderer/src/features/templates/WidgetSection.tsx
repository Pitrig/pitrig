import { Plus, Shapes, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState, PageSection } from '@/app/workspace/PageShell'
import { useWorkspaceStore } from '@/app/workspace/workspace-store'
import { useDashboardEditorStore } from '@/features/configuration/dashboard-editor'
import { usePreviewAssetStore } from '@/features/configuration/preview/preview-assets'
import { useDeviceStore } from '@/features/device/device-store'
import { useImageLibraryStore } from '@/features/image-assets/image-library-store'
import { screensOf, widgetsOf } from '@shared/configuration-access'
import type { WidgetTemplateSummary } from '@shared/templates'
import { TemplateCard } from './TemplateCard'
import { OpenTemplateFileButton, ShareTemplateButton } from './TemplateFileButtons'
import { NO_TEMPLATES, useTemplatesStore } from './templates-store'
import { WidgetTemplateThumbnail } from './WidgetThumbnail'
import { t } from '@shared/ui-text'

export function WidgetSection({
  busy,
  onNotice,
  onDelete
}: {
  busy: boolean
  onNotice: (notice: string) => void
  onDelete: (entry: WidgetTemplateSummary) => void
}): React.JSX.Element {
  const widgets = useTemplatesStore((state) => state.library ?? NO_TEMPLATES).widgets
  const setError = useTemplatesStore((state) => state.setError)
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  const beginInsert = useDashboardEditorStore((state) => state.beginInsert)
  const setDashboardView = useWorkspaceStore((state) => state.setDashboardView)

  const add = async (entry: WidgetTemplateSummary): Promise<void> => {
    setError(undefined)
    try {
      const result = await window.pitrig.adoptTemplate({ id: entry.id, kind: 'widget' })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      const widget = widgetsOf(screensOf(result.value.configuration)[0])[0]
      if (!widget) {
        setError(t('templates.templateService.theTemplateIsUnreadable'))
        return
      }
      void useImageLibraryStore.getState().refresh()
      void usePreviewAssetStore.getState().refresh()
      beginInsert({ widget, label: entry.name })
      setDashboardView('canvas')
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t('templates.dashboardSection.failedToApplyTheTemplate')
      )
    }
  }

  return (
    <PageSection
      title={t('templates.widgetSection.widgets')}
      description={t('templates.widgetSection.partsOfADashboardKept')}
      actions={<OpenTemplateFileButton kind="widget" disabled={busy} onNotice={onNotice} />}
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
              meta={`${entry.width} × ${entry.height}${entry.widgetCount > 1 ? ` · ${t('configs.librarySection.widgetCount', { count: entry.widgetCount })}` : ''}`}
              preview={
                <WidgetTemplateThumbnail id={entry.id} widget={entry.widget} className="size-full" />
              }
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
                    onClick={() => void add(entry)}
                  >
                    <Plus aria-hidden="true" className="mr-1 size-3.5" />
                    {t('common.add')}</Button>
                  <div className="grid grid-cols-2 gap-1">
                    <ShareTemplateButton
                      id={entry.id}
                      kind="widget"
                      name={entry.name}
                      disabled={busy}
                      onNotice={onNotice}
                    />
                    <Button
                      aria-label={t('configs.librarySection.deleteName', { name: entry.name })}
                      className="h-7 px-2 text-red-400 hover:text-red-300"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onDelete(entry)}
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </Button>
                  </div>
                </>
              }
            />
          ))}
        </ul>
      )}
    </PageSection>
  )
}
