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

export function NoConfiguration(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const offlineBoard = useDeviceStore((state) => state.offlineBoard)
  const setOfflineBoard = useDeviceStore((state) => state.setOfflineBoard)
  const [message, setMessage] = useState<string>()
  const board = session?.info.boardId ?? offlineBoard ?? ''
  const pins = board ? (BOARD_PROFILES[board as SimCoreBoardId]?.led.pins ?? []) : []

  return (
    <PageSection
      title="No configuration open"
      description="Peripherals live in the same draft the dashboard uses, so this needs no board plugged in."
    >
      <EmptyState
        icon={<Puzzle aria-hidden="true" className="size-6" />}
        title="Nothing to configure yet"
      >
        <div className="flex flex-col items-center gap-3">
          {session ? (
            <p className="text-[11px] text-muted-foreground">
              {`Authoring for the connected ${boardName(session.info.boardId)}.`}
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
              This board publishes no free pins for LEDs yet, so the firmware will refuse any output
              on it. You can still author one and move the draft to another board later.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              disabled={!board}
              title={board ? undefined : 'Choose a board first'}
              onClick={() => setMessage(createConfiguration(board as SimCoreBoardId).message)}
            >
              New configuration
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void openConfigurationFile().then((result) => setMessage(result?.message))
              }
            >
              Open file…
            </Button>
          </div>
          {message ? (
            <p className="max-w-sm text-[11px] text-muted-foreground">{message}</p>
          ) : null}
        </div>
      </EmptyState>
    </PageSection>
  )
}
