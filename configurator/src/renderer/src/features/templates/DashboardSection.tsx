import { LayoutTemplate, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

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
  SIMCORE_BOARD_IDS,
  type DeviceConfiguration
} from '@shared/device'
import { transferConfiguration, type LayoutTransferResult } from '@shared/layout-transfer'
import { displaySize } from '@/features/configuration/board-labels'
import type { DashboardTemplateSummary } from '@shared/templates'
import { DashboardThumbnail } from './DashboardThumbnail'
import { TemplateCard } from './TemplateCard'
import { useInsertScreenStore } from './insert-screen-store'
import { NO_TEMPLATES, useTemplatesStore } from './templates-store'

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
  const openPicker = useInsertScreenStore((state) => state.openPicker)
  const [report, setReport] = useState<LayoutTransferResult>()
  const [missing, setMissing] = useState<readonly string[]>([])

  const targetBoard = session?.info.boardId ?? draft?.board

  const use = async (summary: DashboardTemplateSummary): Promise<void> => {
    if (
      hasLocalDraft &&
      !window.confirm(
        `Replace everything you have open with "${summary.name}"? Every screen and every widget in the current draft is discarded.`
      )
    ) {
      return
    }
    setBusy(true)
    setError(undefined)
    setReport(undefined)
    setMissing([])
    try {
      const result = await window.simcore.readTemplate({ id: summary.id, kind: 'dashboard' })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      if (result.value.format !== 'simcore-dashboard-template') {
        setError('That entry is not a dashboard.')
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
        supportedBoards: SIMCORE_BOARD_IDS
      })
      if (!validated.ok) {
        setError(
          `"${summary.name}" would not be accepted on this board, so the draft was left alone. ${validated.error}`
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
      setError(bridgeError instanceof Error ? bridgeError.message : 'Failed to apply the template.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageSection
      title="Dashboards"
      description={
        targetBoard
          ? `Whole layouts, scaled to ${displaySize(targetBoard) ?? targetBoard} on the way in. Add takes screens from one; Use replaces what you have open.`
          : 'Whole layouts. Add takes screens from one; Use replaces what you have open.'
      }
    >
      {templates.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate aria-hidden="true" className="size-6" />}
          title="No dashboards"
        >
          Save the dashboard you are working on with <b>Save to templates</b> on the canvas, and it
          will be here next time.
        </EmptyState>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {templates.map((summary) => (
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
                      Starter
                    </Badge>
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
                        ? 'Add screens from this template to the dashboard you have open'
                        : 'Open a dashboard first — there is nothing to add screens to'
                    }
                    onClick={() => openPicker(summary)}
                  >
                    <Plus aria-hidden="true" className="mr-1 size-3.5" />
                    Add
                  </Button>
                  <Button
                    className="h-7 px-2"
                    variant="outline"
                    disabled={busy}
                    title="Replace everything you have open with this template"
                    onClick={() => void use(summary)}
                  >
                    Use
                  </Button>
                  {summary.origin === 'user' ? (
                    <Button
                      aria-label={`Delete ${summary.name}`}
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
            <span className="font-medium">Layout transfer</span>
            <button
              className="text-sky-300/70 hover:text-sky-200"
              type="button"
              onClick={() => setReport(undefined)}
            >
              Dismiss
            </button>
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
