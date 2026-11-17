import { useDashboardEditorStore } from '@/features/configuration/dashboard-editor'
import { useEditorPanelStore } from '@/features/configuration/editor/panel-store'
import { usePreviewAssetStore } from '@/features/configuration/preview/preview-assets'
import { useDeviceStore } from '@/features/device/device-store'
import { useImageLibraryStore } from '@/features/image-assets/image-library-store'
import { adoptDashboard } from '@/features/templates/adopt-dashboard'
import type { DashboardOpenReport, OpenedDashboard } from '@shared/dashboard-files'
import { t } from '@shared/ui-text'
import { useOpenReportStore } from './open-report-store'

export interface OpenFeedback {
  kind: 'success' | 'error'
  message: string
}

export function adoptOpenedDashboard(opened: OpenedDashboard, fileName: string): OpenFeedback {
  const device = useDeviceStore.getState()
  const adopted = adoptDashboard(opened.configuration, {
    draft: device.draft,
    board: device.session?.info.boardId,
    display: device.session?.info.display,
    fit: useEditorPanelStore.getState().transferFit
  })
  if (!adopted.ok) {
    return {
      kind: 'error',
      message: t('templates.dashboardSection.nameWouldNotBeAccepted', {
        name: opened.name,
        error: adopted.error
      })
    }
  }
  device.replaceLocalDraft(adopted.configuration, fileName)
  useDashboardEditorStore.getState().resetEditorState()
  void useImageLibraryStore.getState().refresh()
  void usePreviewAssetStore.getState().refresh()
  const { from, to } = adopted.report
  const scaled = from.width !== to.width || from.height !== to.height
  const feedback: OpenFeedback = { kind: 'success', message: describeOpened(opened, scaled) }
  useOpenReportStore.getState().show(feedback)
  return feedback
}

export function describeOpened(opened: OpenedDashboard, scaled: boolean): string {
  const parts = [t('share.open.opened', { name: opened.name }), ...describeAssets(opened.report)]
  if (scaled) parts.push(t('share.open.scaled'))
  parts.push(t('share.open.next'))
  return parts.join(' ')
}

export function describeAssets(report: DashboardOpenReport): string[] {
  const parts: string[] = []
  const added = [...report.imagesAdded, ...report.fontsAdded]
  if (added.length > 0) parts.push(t('share.open.added', { names: added.join(', ') }))
  const renamed = [...report.imagesRenamed, ...report.fontsRenamed]
  if (renamed.length > 0) {
    parts.push(
      t('share.open.renamed', {
        names: renamed.map((entry) => `${entry.from} → ${entry.to}`).join(', ')
      })
    )
  }
  if (report.imagesMissing.length > 0) {
    parts.push(t('share.open.imagesMissing', { images: report.imagesMissing.join(', ') }))
  }
  if (report.fontsMissing.length > 0) {
    parts.push(t('share.open.fontsMissing', { fonts: report.fontsMissing.join(', ') }))
  }
  parts.push(...report.failures)
  return parts
}
