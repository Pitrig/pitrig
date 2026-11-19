import { useState } from 'react'
import { t } from '@shared/ui-text'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { PageSection, PageShell } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { useDraftState } from '@/features/device/draft-state'
import {
  SaveFeedbackNote,
  SaveProgressBar,
  SaveToBoardButton
} from '@/features/device/save-to-board-ui'
import { useSaveToBoardStore } from '@/features/device/save-to-board-store'
import { transferReportLines } from '@/features/configuration/transfer-report'
import { ShareDashboardButton } from '@/features/dashboard-files/ShareDashboardDialog'
import { useEditorPanelStore } from './editor/panel-store'
import { BoardPicker } from './preview/BoardPicker'
import { BOARD_NAMES, boardName, fitOutcome } from './board-labels'
import { useConfigurationLibrary } from './config-library-store'
import {
  convertDraftToBoard,
  createConfiguration,
  openConfigurationFile,
  saveConfigurationFile,
  type ActionFeedback
} from './configuration-actions'
import { BoardSection } from './configs/BoardSection'
import { DocumentSizeNotes } from './configs/DocumentSizeNotes'
import { FeedbackNote } from './configs/FeedbackNote'
import { RecentList } from './configs/RecentList'
import { BOARD_PROFILES, type PitrigBoardId } from '@shared/device'
import type { LayoutFit, LayoutTransferResult } from '@shared/layout-transfer'

export function ConfigsPage(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draft = useDeviceStore((state) => state.draft)
  const draftFileName = useDeviceStore((state) => state.draftFileName)
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  const rebootRequired = useDeviceStore((state) => state.rebootRequired)
  const offlineBoard = useDeviceStore((state) => state.offlineBoard)
  const saving = useSaveToBoardStore((state) => state.running)
  const { parsed, dirty, boardMismatch } = useDraftState()
  const { library, error, loading, refresh } = useConfigurationLibrary()
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<ActionFeedback>()
  const [report, setReport] = useState<LayoutTransferResult>()
  const targetBoard = session?.info.boardId ?? offlineBoard ?? draft?.board
  const working = busy || saving

  const act = async (action: () => Promise<ActionFeedback | undefined>): Promise<void> => {
    setBusy(true)
    setFeedback(undefined)
    setReport(undefined)
    try {
      setFeedback(await action())
    } finally {
      setBusy(false)
      refresh()
    }
  }

  return (
    <PageShell
      title={t('dashboard.configsPage.configs')}
      description={t('dashboard.configsPage.yourSetupFiles')}
      actions={
        <>
          {rebootRequired ? (
            <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-300" variant="outline">
              {t('dashboard.configsPage.restartRequired')}</Badge>
          ) : dirty ? (
            <Badge className="border-sky-500/40 bg-sky-500/15 text-sky-300" variant="outline">
              {t('dashboard.configsPage.modified')}</Badge>
          ) : null}
          <SaveToBoardButton disabled={busy} />
        </>
      }
    >
      <SaveProgressBar />
      <SaveFeedbackNote />

      <PageSection
        title={
          draftFileName ??
          (hasLocalDraft
            ? t('dashboard.configsPage.untitledSetup')
            : t('dashboard.configsPage.nothingOpen'))
        }
        description={
          draftFileName
            ? undefined
            : hasLocalDraft
              ? t('dashboard.configsPage.notSavedToAFile')
              : t('dashboard.configsPage.startANewSetupOr')
        }
        actions={<BoardPicker />}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={working || !targetBoard}
              title={targetBoard ? undefined : t('dashboard.configsPage.pickABoardFirst')}
              onClick={() => {
                if (!targetBoard) return
                void act(() => createConfiguration(targetBoard as PitrigBoardId))
              }}
            >
              {t('dashboard.configsPage.new')}</Button>
            <Button variant="outline" disabled={working} onClick={() => void act(openConfigurationFile)}>
              {t('dashboard.configsPage.open')}</Button>
            <Button
              variant="outline"
              disabled={working || !parsed.ok}
              title={t('dashboard.configsPage.saveTheConfigurationToA')}
              onClick={() => void act(saveConfigurationFile)}
            >
              {t('dashboard.configsPage.save')}</Button>
            <ShareDashboardButton />
          </div>

          {hasLocalDraft && !parsed.ok ? (
            <p className="text-[11px] text-red-400">
              {t('dashboard.configsPage.thisSetupHasAnError', { error: parsed.error })}
            </p>
          ) : null}
          {parsed.ok ? <DocumentSizeNotes configuration={parsed.configuration} /> : null}

          {boardMismatch && parsed.ok && session ? (
            <ConvertToBoard
              from={parsed.configuration.board}
              to={session.info.boardId}
              display={session.info.display}
              working={working}
              onDone={(result) => {
                setReport(result.report)
                setFeedback(result.feedback)
              }}
            />
          ) : null}

          {report ? <TransferReport report={report} onDismiss={() => setReport(undefined)} /> : null}
          <FeedbackNote feedback={feedback} />
        </div>

        <RecentList
          library={library}
          error={error}
          loading={loading}
          working={working}
          onRefresh={refresh}
          onFeedback={setFeedback}
        />
      </PageSection>

      <BoardSection working={working} onAct={act} />
    </PageShell>
  )
}

function ConvertToBoard({
  from,
  to,
  display,
  working,
  onDone
}: {
  from: PitrigBoardId
  to: PitrigBoardId
  display?: { width: number; height: number }
  working: boolean
  onDone: (result: { feedback?: ActionFeedback; report?: LayoutTransferResult }) => void
}): React.JSX.Element {
  const fit = useEditorPanelStore((state) => state.transferFit)
  const setFit = useEditorPanelStore((state) => state.setTransferFit)
  const none = { width: 0, height: 0 }
  return (
    <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
      <p>
        {t('dashboard.configsPage.setupForAnotherBoard', { draftBoard: boardName(from), board: boardName(to) })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select<LayoutFit>
          aria-label={t('dashboard.configsPage.fitToTheNewDisplay')}
          className="w-56"
          disabled={working}
          value={fit}
          options={[
            { value: 'contain', label: t('dashboard.configsPage.keepProportionsCentre') },
            { value: 'stretch', label: t('dashboard.configsPage.stretchToFillTheDisplay') }
          ]}
          onChange={setFit}
        />
        <Button
          variant="outline"
          disabled={working}
          onClick={() => void convertDraftToBoard(to, fit, display).then(onDone)}
        >
          {t('dashboard.configsPage.convertDraftToConverttarget', { convertTarget: BOARD_NAMES[to] })}
        </Button>
      </div>
      <p className="text-amber-200/70">
        {fitOutcome(
          BOARD_PROFILES[from].display ?? none,
          display ?? BOARD_PROFILES[to].display ?? none,
          fit
        )}
      </p>
    </div>
  )
}

function TransferReport({
  report,
  onDismiss
}: {
  report: LayoutTransferResult
  onDismiss: () => void
}): React.JSX.Element | null {
  const lines = transferReportLines(report)
  if (lines.length === 0) return null
  return (
    <div className="space-y-1 rounded-md border border-sky-500/30 bg-sky-500/10 p-2 text-[11px] text-sky-200">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{t('templates.dashboardSection.layoutTransfer')}</span>
        <button className="text-sky-300/70 hover:text-sky-200" type="button" onClick={onDismiss}>
          {t('templates.dashboardSection.dismiss')}</button>
      </div>
      <ul className="list-disc space-y-0.5 pl-4">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}
