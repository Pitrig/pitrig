import { useState } from 'react'
import { t } from '@shared/ui-text'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageSection } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { useDraftState } from '@/features/device/draft-state'
import { SaveFeedbackNote, SaveProgressBar } from '@/features/device/save-to-board-ui'
import { saveDraftToBoard } from '@/features/device/save-to-board-store'
import {
  loadDocumentFromBoard,
  readConfigurationFromBoard,
  resetBoardConfiguration,
  resetBoardDocument,
  restartBoard,
  type ActionFeedback
} from '../configuration-actions'
import { FeedbackNote } from './FeedbackNote'
import type { ConfigurationDocumentOutcome } from '@shared/device'
import { CONFIGURATION_DOCUMENT_IDS } from '@shared/configuration-schema'
import {
  documentPayloadBytes
} from '@shared/configuration-documents'

export function BoardDocumentsSection({
  working,
  onAct
}: {
  working: boolean
  onAct: (action: () => Promise<ActionFeedback | undefined>) => Promise<void>
}): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const activeConfiguration = useDeviceStore((state) => state.activeConfiguration)
  const draft = useDeviceStore((state) => state.draft)
  const { connected, dirtyDocuments, saveBlockedReason } = useDraftState()
  const [feedback, setFeedback] = useState<ActionFeedback>()

  return (
    <PageSection
      title={t('configs.boardDocumentsSection.configsOnTheBoard')}
      description={t('configs.boardDocumentsSection.threeDocumentsStoredAndWritten')}
    >
      <div className="space-y-3">
        <SaveProgressBar />
        <SaveFeedbackNote />
        {!working && saveBlockedReason ? (
          <p className="text-[11px] text-muted-foreground">{saveBlockedReason}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {t('configs.boardDocumentsSection.savingWritesOnlyTheDocuments')}</p>
        )}

        <ul className="divide-y rounded-md border">
          {CONFIGURATION_DOCUMENT_IDS.map((id) => {
            const stored = session?.info.documents[id]
            const modified = dirtyDocuments.includes(id)
            const bytes = draft ? documentPayloadBytes(draft, id) : 0
            return (
              <li key={id} className="space-y-2 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {t(`documents.label.${id}`)}
                      </span>
                      <DocumentStatusBadge
                        connected={connected}
                        modified={modified}
                        outcome={stored?.outcome}
                      />
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {t(`documents.summary.${id}`)}
                      {draft ? t('configs.boardDocumentsSection.bytesBytes', { bytes: bytes }) : ''}
                      {stored?.outcome === 'valid' ? t('configs.boardDocumentsSection.generationGeneration', { generation: stored.generation }) : ''}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    disabled={!connected || working || !activeConfiguration || !draft}
                    title={t('configs.boardDocumentsSection.takeThisDocumentBackFrom')}
                    onClick={() => setFeedback(loadDocumentFromBoard(id))}
                  >
                    {t('common.load')}</Button>
                  <Button
                    variant="outline"
                    disabled={!connected || working || !modified || Boolean(saveBlockedReason)}
                    title={t('configs.boardDocumentsSection.writeOnlyThisDocumentTo')}
                    onClick={() => void saveDraftToBoard([id])}
                  >
                    {t('common.save')}</Button>
                  <Button
                    className="text-red-400 hover:text-red-300"
                    variant="outline"
                    disabled={!connected || working || !session?.info.storageAvailable}
                    title={t('configs.boardDocumentsSection.eraseThisDocumentFromThe')}
                    onClick={() => void onAct(() => resetBoardDocument(id))}
                  >
                    {t('common.reset')}</Button>
                </div>
              </li>
            )
          })}
        </ul>

        <FeedbackNote feedback={feedback} />

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={!connected || working}
            onClick={() => void onAct(readConfigurationFromBoard)}
          >
            {t('configs.boardDocumentsSection.loadAllFromBoard')}</Button>
          <Button
            variant="outline"
            disabled={!connected || working}
            onClick={() => void onAct(restartBoard)}
          >
            {t('firmware.firmwarePage.restartBoard')}</Button>
          <Button
            className="col-span-2 text-red-400 hover:text-red-300"
            variant="outline"
            disabled={!connected || working || !session?.info.storageAvailable}
            onClick={() => void onAct(resetBoardConfiguration)}
          >
            {t('configs.boardDocumentsSection.resetToFactoryConfiguration')}</Button>
        </div>
      </div>
    </PageSection>
  )
}

function DocumentStatusBadge({
  connected,
  modified,
  outcome
}: {
  connected: boolean
  modified: boolean
  outcome?: ConfigurationDocumentOutcome
}): React.JSX.Element | null {
  if (!connected) return null
  if (outcome && outcome !== 'valid' && outcome !== 'absent') {
    return (
      <Badge className="border-red-500/40 bg-red-500/15 text-red-300" variant="outline">
        {t('configs.boardDocumentsSection.refused')}</Badge>
    )
  }
  if (modified) {
    return (
      <Badge className="border-sky-500/40 bg-sky-500/15 text-sky-300" variant="outline">
        {t('dashboard.configsPage.modified')}</Badge>
    )
  }
  if (outcome === 'absent') {
    return (
      <Badge className="text-muted-foreground" variant="outline">
        {t('configs.boardDocumentsSection.factory')}</Badge>
    )
  }
  return (
    <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300" variant="outline">
      {t('configs.boardDocumentsSection.inSync')}</Badge>
  )
}
