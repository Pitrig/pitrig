import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { PageSection } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { useSaveToBoardStore } from '@/features/device/save-to-board-store'
import {
  resetBoardConfiguration,
  restartBoard,
  type ActionFeedback
} from '@/features/configuration/configuration-actions'
import { t } from '@shared/ui-text'

export function FactoryResetSection({ blocked }: { blocked: boolean }): React.JSX.Element | null {
  const session = useDeviceStore((state) => state.session)
  const rebootRequired = useDeviceStore((state) => state.rebootRequired)
  const saving = useSaveToBoardStore((state) => state.running)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<ActionFeedback>()

  if (!session) return null
  const disabled = blocked || busy || saving

  const run = async (action: () => Promise<ActionFeedback | undefined>): Promise<void> => {
    setBusy(true)
    setFeedback(undefined)
    try {
      setFeedback(await action())
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageSection
      title={t('firmware.factoryReset.factoryReset')}
      description={t('firmware.factoryReset.eraseTheSetupSaved')}
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <Button
            className="flex-1 text-red-400 hover:text-red-300"
            variant="outline"
            disabled={disabled || !session.info.storageAvailable}
            onClick={() => void run(resetBoardConfiguration)}
          >
            {t('firmware.factoryReset.resetToFactory')}</Button>
          {rebootRequired ? (
            <Button
              className="flex-1"
              variant="outline"
              disabled={disabled}
              onClick={() => void run(restartBoard)}
            >
              {t('firmware.firmwarePage.restartBoard')}</Button>
          ) : null}
        </div>
        {feedback ? (
          <p
            className={`break-words text-[11px] ${feedback.kind === 'error' ? 'text-red-400' : 'text-muted-foreground'}`}
          >
            {feedback.message}
          </p>
        ) : null}
      </div>
    </PageSection>
  )
}
