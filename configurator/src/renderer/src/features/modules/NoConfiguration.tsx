import { useState } from 'react'
import { Puzzle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState, PageSection } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { BoardChoice } from '@/features/configuration/preview/BoardPicker'
import { boardName } from '@/features/configuration/board-labels'
import {
  createConfiguration,
  openConfigurationFile
} from '@/features/configuration/configuration-actions'
import { BOARD_PROFILES, type SimCoreBoardId } from '@shared/device'
import { t } from '@shared/ui-text'

export function NoConfiguration(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const offlineBoard = useDeviceStore((state) => state.offlineBoard)
  const setOfflineBoard = useDeviceStore((state) => state.setOfflineBoard)
  const [message, setMessage] = useState<string>()
  const board = session?.info.boardId ?? offlineBoard ?? ''
  const pins = board ? (BOARD_PROFILES[board as SimCoreBoardId]?.led.pins ?? []) : []

  return (
    <PageSection
      title={t('protocol.transportSection.noConfigurationOpen')}
      description={t('modules.noConfiguration.peripheralsLiveInTheSame')}
    >
      <EmptyState
        icon={<Puzzle aria-hidden="true" className="size-6" />}
        title={t('modules.noConfiguration.nothingToConfigureYet')}
      >
        <div className="flex flex-col items-center gap-3">
          {session ? (
            <p className="text-[11px] text-muted-foreground">
              {t('canvas.displayPreview.authoringForTheConnectedBoardid', { boardId: boardName(session.info.boardId) })}
            </p>
          ) : (
            <BoardChoice
              value={board as SimCoreBoardId | ''}
              onChange={(next) => {
                setOfflineBoard(next || undefined)
                setMessage(undefined)
              }}
            />
          )}
          {board && pins.length === 0 ? (
            <p className="max-w-sm text-[11px] text-amber-400/80">
              {t('modules.noConfiguration.thisBoardPublishesNoFree')}</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              disabled={!board}
              title={board ? undefined : t('canvas.displayPreview.chooseABoardFirst')}
              onClick={() => setMessage(createConfiguration(board as SimCoreBoardId).message)}
            >
              {t('modules.noConfiguration.newConfiguration')}</Button>
            <Button
              variant="outline"
              onClick={() =>
                void openConfigurationFile().then((result) => setMessage(result?.message))
              }
            >
              {t('modules.noConfiguration.openFile')}</Button>
          </div>
          {message ? (
            <p className="max-w-sm text-[11px] text-muted-foreground">{message}</p>
          ) : null}
        </div>
      </EmptyState>
    </PageSection>
  )
}
