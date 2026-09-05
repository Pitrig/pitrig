import { useState } from 'react'
import { t } from '@shared/ui-text'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageSection, PageShell } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { useDraftState } from '@/features/device/draft-state'
import { SaveToBoardButton } from '@/features/device/save-to-board-ui'
import { useSaveToBoardStore } from '@/features/device/save-to-board-store'
import { transferReportLines } from '@/features/configuration/transfer-report'
import { useEditorPanelStore } from './editor/panel-store'
import { BOARD_NAMES, boardLabel, fitOutcome } from './board-labels'
import {
  convertDraftToBoard,
  createConfiguration,
  openConfigurationFile,
  saveConfigurationFile,
  type ActionFeedback
} from './configuration-actions'
import { BoardDocumentsSection } from './configs/BoardDocumentsSection'
import { ChangesSection } from './configs/ChangesSection'
import { AdvancedJsonSection } from './configs/AdvancedJsonSection'
import { LibrarySection } from './configs/LibrarySection'
import { FeedbackNote } from './configs/FeedbackNote'
import { BOARD_PROFILES, PITRIG_BOARD_IDS, type PitrigBoardId } from '@shared/device'
import { CONFIGURATION_DOCUMENTS, CONFIGURATION_DOCUMENT_IDS } from '@shared/configuration-schema'
import {
  documentPayloadBytes
} from '@shared/configuration-documents'
import type { LayoutFit, LayoutTransferResult } from '@shared/layout-transfer'

export function ConfigsPage(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draftFileName = useDeviceStore((state) => state.draftFileName)
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  const rebootRequired = useDeviceStore((state) => state.rebootRequired)
  const saving = useSaveToBoardStore((state) => state.running)
  const { parsed, dirty, connected } = useDraftState()

  const offlineBoard = useDeviceStore((state) => state.offlineBoard)
  const setOfflineBoard = useDeviceStore((state) => state.setOfflineBoard)
  const fit = useEditorPanelStore((state) => state.transferFit)
  const setFit = useEditorPanelStore((state) => state.setTransferFit)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<ActionFeedback>()
  const [report, setReport] = useState<LayoutTransferResult>()
  const targetBoard = session?.info.boardId ?? offlineBoard ?? ''
  const working = busy || saving

  const act = async (action: () => Promise<ActionFeedback | undefined>): Promise<void> => {
    setBusy(true)
    setFeedback(undefined)
    setReport(undefined)
    try {
      setFeedback(await action())
    } finally {
      setBusy(false)
    }
  }

  const convertTarget =
    parsed.ok && targetBoard && parsed.configuration.board !== targetBoard
      ? targetBoard
      : undefined

  const convert = (target: PitrigBoardId): void => {
    setFeedback(undefined)
    setReport(undefined)
    const result = convertDraftToBoard(target, fit, session?.info.display)
    if (result.report) setReport(result.report)
    if (result.feedback) setFeedback(result.feedback)
  }

  return (
    <PageShell
      title={t('dashboard.configsPage.configs')}
      description={t('dashboard.configsPage.theDashboardDocumentFilesSaved')}
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
      <PageSection
        title={t('dashboard.configsPage.document')}
        description={
          draftFileName ?? (hasLocalDraft ? 'Unsaved local draft' : 'No local configuration')
        }
      >
        <div className="space-y-3">
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            <span>{t('device.infoPage.board')}</span>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
              disabled={working || connected}
              value={targetBoard}
              onChange={(event) =>
                setOfflineBoard((event.target.value as PitrigBoardId | '') || undefined)
              }
            >
              <option value="">{t('dashboard.configsPage.selectBoard')}</option>
              {PITRIG_BOARD_IDS.map((id) => (
                <option key={id} value={id}>
                  {boardLabel(id)}
                </option>
              ))}
            </select>
            {connected ? (
              <span className="block">{t('dashboard.configsPage.theConnectedBoardDecidesThis')}</span>
            ) : null}
          </label>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              disabled={working || !targetBoard}
              onClick={() => setFeedback(createConfiguration(targetBoard as PitrigBoardId))}
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
              {t('dashboard.configsPage.saveAs')}</Button>
          </div>

          {parsed.ok ? (
            <div className="space-y-0.5 text-[11px] text-muted-foreground">
              {CONFIGURATION_DOCUMENT_IDS.map((id) => {
                const bytes = documentPayloadBytes(parsed.configuration, id)
                const limit = CONFIGURATION_DOCUMENTS[id].maxPayload
                return (
                  <div key={id} className="flex items-center justify-between">
                    <span>{t(`documents.label.${id}`)}</span>
                    <span className={bytes > limit ? 'text-red-400' : undefined}>
                      {t('configs.configsPage.bytesOfLimit', { bytes: bytes, limit: limit })}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">{t('dashboard.configsPage.invalidJson')}</p>
          )}
          {parsed.ok ? null : <p className="text-[11px] text-red-400">{parsed.error}</p>}

          {convertTarget ? (
            <div className="space-y-2 rounded-md border border-dashed p-2">
              <label className="block space-y-1 text-[11px] text-muted-foreground">
                <span>{t('dashboard.configsPage.fitToTheNewDisplay')}</span>
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
                  disabled={working}
                  value={fit}
                  onChange={(event) => setFit(event.target.value as LayoutFit)}
                >
                  <option value="contain">{t('dashboard.configsPage.keepProportionsCentre')}</option>
                  <option value="stretch">{t('dashboard.configsPage.stretchToFillTheDisplay')}</option>
                </select>
              </label>
              <p className="text-[11px] text-muted-foreground">
                {parsed.ok
                  ? fitOutcome(
                      BOARD_PROFILES[parsed.configuration.board].display ?? { width: 0, height: 0 },
                      session?.info.display ??
                        BOARD_PROFILES[convertTarget].display ?? { width: 0, height: 0 },
                      fit
                    )
                  : null}
              </p>
              <Button
                className="w-full"
                variant="outline"
                disabled={working}
                onClick={() => convert(convertTarget)}
              >
                {t('dashboard.configsPage.convertDraftToConverttarget', { convertTarget: BOARD_NAMES[convertTarget] })}
              </Button>
            </div>
          ) : null}

          {report ? (
            <div className="space-y-1 rounded-md border border-sky-500/30 bg-sky-500/10 p-2 text-[11px] text-sky-200">
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

          <FeedbackNote feedback={feedback} />
        </div>
      </PageSection>

      <BoardDocumentsSection working={working} onAct={act} />

      <ChangesSection />
      <LibrarySection working={working} onFeedback={setFeedback} />

      <AdvancedJsonSection working={working} onEdit={() => setFeedback(undefined)} />
    </PageShell>
  )
}
