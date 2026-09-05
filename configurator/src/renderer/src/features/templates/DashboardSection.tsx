import { LayoutTemplate, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, PageSection } from '@/app/workspace/PageShell'
import { transferReportLines } from '@/features/configuration/transfer-report'
import { useDashboardEditorStore } from '@/features/configuration/dashboard-editor'
import { useEditorPanelStore } from '@/features/configuration/editor/panel-store'
import { useDeviceStore } from '@/features/device/device-store'
import {
  collectFontRequirements,
  missingFontFamilies
} from '@/features/font-library/font-requirements'
import { withWidgetIds } from '@shared/configuration-access'
import { validateConfigurationDocument } from '@shared/configuration-validate'
import {
  applyBoardTransportDefaults,
  PITRIG_BOARD_IDS,
  type DeviceConfiguration
} from '@shared/device'
import { transferConfiguration, type LayoutTransferResult } from '@shared/layout-transfer'
import { displaySize } from '@/features/configuration/board-labels'
import type { DashboardTemplateSummary } from '@shared/templates'
import { DashboardThumbnail } from './DashboardThumbnail'
import { DashboardListControls } from './DashboardListControls'
import { EVERY_BOARD, listedDashboards } from './dashboard-listing'
import { TemplateCard } from './TemplateCard'
import { useInsertScreenStore } from './insert-screen-store'
import { NO_TEMPLATES, useTemplatesStore } from './templates-store'
import { t } from '@shared/ui-text'

export function DashboardSection({
  busy,
  setBusy,
  onNotice,
  onDelete
}: {
  busy: boolean
  setBusy: (busy: boolean) => void
  onNotice: (notice: string) => void
  onDelete: (entry: DashboardTemplateSummary) => void
}): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draft = useDeviceStore((state) => state.draft)
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  const replaceLocalDraft = useDeviceStore((state) => state.replaceLocalDraft)
  const resetEditorState = useDashboardEditorStore((state) => state.resetEditorState)
  const setError = useTemplatesStore((state) => state.setError)
  const templates = useTemplatesStore((state) => state.library ?? NO_TEMPLATES).dashboards
  const fit = useEditorPanelStore((state) => state.transferFit)
  const sort = useEditorPanelStore((state) => state.templateSort)
  const board = useEditorPanelStore((state) => state.templateBoard)
  const setBoard = useEditorPanelStore((state) => state.setTemplateBoard)
  const openPicker = useInsertScreenStore((state) => state.openPicker)
  const [report, setReport] = useState<LayoutTransferResult>()
  const [missing, setMissing] = useState<readonly string[]>([])

  const targetBoard = session?.info.boardId ?? draft?.board
  const listed = useMemo(
    () => listedDashboards(templates, board, sort),
    [templates, board, sort]
  )

  const use = async (summary: DashboardTemplateSummary): Promise<void> => {
    if (
      hasLocalDraft &&
      !window.confirm(
        t('templates.dashboardSection.replaceEverythingYouHaveOpen2', { name: summary.name })
      )
    ) {
      return
    }
    setBusy(true)
    setError(undefined)
    setReport(undefined)
    setMissing([])
    try {
      const result = await window.pitrig.readTemplate({ id: summary.id, kind: 'dashboard' })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      if (result.value.format !== 'pitrig-dashboard-template') {
        setError(t('templates.dashboardSection.thatEntryIsNotA'))
        return
      }
      const board = session?.info.boardId ?? draft?.board ?? result.value.configuration.board
      const transferred = transferConfiguration(result.value.configuration, {
        board,
        display: session?.info.display,
        fit
      })
      setReport(transferred)
      const adopted = applyBoardTransportDefaults(
        withWidgetIds(keepDraftTransport(transferred.configuration, draft))
      )
      const validated = validateConfigurationDocument(adopted, {
        supportedBoards: PITRIG_BOARD_IDS
      })
      if (!validated.ok) {
        setError(
          t('templates.dashboardSection.nameWouldNotBeAccepted', { name: summary.name, error: validated.error })
        )
        return
      }
      replaceLocalDraft(validated.configuration)
      resetEditorState()
      setMissing(
        missingFontFamilies(
          collectFontRequirements(validated.configuration),
          session?.fontAssets?.families ?? []
        )
      )
      onNotice(`"${summary.name}" is now the local draft.`)
    } catch (bridgeError) {
      setError(bridgeError instanceof Error ? bridgeError.message : t('templates.dashboardSection.failedToApplyTheTemplate'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageSection
      title={t('templates.dashboardSection.dashboards')}
      description={
        targetBoard
          ? `Whole layouts, scaled to ${displaySize(targetBoard) ?? targetBoard} on the way in. Add takes screens from one; Use replaces what you have open.`
          : t('templates.dashboardSection.wholeLayoutsAddTakesScreens')
      }
      actions={<DashboardListControls entries={templates} />}
    >
      {templates.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate aria-hidden="true" className="size-6" />}
          title={t('templates.dashboardSection.noDashboards')}
        >
          {t('templates.dashboardSection.emptyBefore')}
          <b>{t('templates.dashboardSection.saveToTemplates')}</b>
          {t('templates.dashboardSection.emptyAfter')}
        </EmptyState>
      ) : listed.length === 0 ? (
        <p className="rounded-md border p-3 text-xs text-muted-foreground">
          {`No dashboard here is drawn for ${displaySize(board) ?? board}. `}
          <button
            className="underline underline-offset-2 hover:text-foreground"
            type="button"
            onClick={() => setBoard(EVERY_BOARD)}
          >
            {t('templates.dashboardSection.showEverySize')}</button>
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {listed.map((summary) => (
            <TemplateCard
              key={summary.id}
              name={summary.name}
              description={summary.description}
              meta={`${summary.screenCount} screen${summary.screenCount === 1 ? '' : 's'} · ${summary.widgetCount} widget${summary.widgetCount === 1 ? '' : 's'}`}
              preview={<DashboardThumbnail id={summary.id} board={summary.board} />}
              badges={
                <>
                  {summary.origin === 'bundled' ? (
                    <Badge
                      className="flex-none border-zinc-500/40 bg-zinc-500/15 text-zinc-300"
                      variant="outline"
                    >
                      {t('templates.dashboardSection.starter')}</Badge>
                  ) : null}
                  <Badge className="flex-none" variant="outline" title={summary.board}>
                    {displaySize(summary.board) ?? summary.board}
                  </Badge>
                </>
              }
              actions={
                <>
                  <Button
                    className="h-7 px-2"
                    variant="outline"
                    disabled={busy || !hasLocalDraft}
                    title={
                      hasLocalDraft
                        ? t('templates.dashboardSection.addScreensFromThisTemplate')
                        : t('templates.dashboardSection.openADashboardFirstThere')
                    }
                    onClick={() => openPicker(summary)}
                  >
                    <Plus aria-hidden="true" className="mr-1 size-3.5" />
                    {t('common.add')}</Button>
                  <Button
                    className="h-7 px-2"
                    variant="outline"
                    disabled={busy}
                    title={t('templates.dashboardSection.replaceEverythingYouHaveOpen')}
                    onClick={() => void use(summary)}
                  >
                    {t('templates.dashboardSection.use')}</Button>
                  {summary.origin === 'user' ? (
                    <Button
                      aria-label={t('configs.librarySection.deleteName', { name: summary.name })}
                      className="h-7 px-2 text-red-400 hover:text-red-300"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onDelete(summary)}
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </Button>
                  ) : null}
                </>
              }
            />
          ))}
        </ul>
      )}

      {missing.length > 0 ? (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-amber-300">
          {`Needs font famil${missing.length === 1 ? 'y' : 'ies'} not installed on the board: ${missing.join(', ')}. Choose a source on the Fonts page; saving to the board uploads them.`}
        </p>
      ) : null}
      {report ? (
        <div className="mt-3 space-y-1 rounded-md border border-sky-500/30 bg-sky-500/10 p-2 text-[11px] text-sky-200">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium">{t('templates.dashboardSection.layoutTransfer')}</span>
            <button
              className="text-sky-300/70 hover:text-sky-200"
              type="button"
              onClick={() => setReport(undefined)}
            >
              {t('templates.dashboardSection.dismiss')}</button>
          </div>
          <ul className="list-disc space-y-0.5 pl-4">
            {transferReportLines(report).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </PageSection>
  )
}

function keepDraftTransport(
  configuration: DeviceConfiguration,
  draft: DeviceConfiguration | undefined
): DeviceConfiguration {
  return draft?.telemetry_transport
    ? { ...configuration, telemetry_transport: draft.telemetry_transport }
    : configuration
}
