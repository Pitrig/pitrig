import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { useBoardActivityReason } from '@/features/device/board-activity'
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
  const busyReason = useBoardActivityReason()
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<ActionFeedback>()

  if (!session) return null
  const disabled = blocked || busy || saving || busyReason !== undefined

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
    <section className="space-y-2 rounded-xl border bg-card px-4 py-3.5 text-xs text-card-foreground shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold">{t('firmware.factoryReset.factoryReset')}</h3>
          <p className="mt-1 text-muted-foreground">{t('firmware.factoryReset.eraseTheSetupOnThe')}</p>
        </div>
        <Button
          className="flex-none text-red-400 hover:text-red-300"
          variant="outline"
          disabled={disabled || !session.info.storageAvailable}
          title={busyReason}
          onClick={() => void run(resetBoardConfiguration)}
        >
          {t('firmware.factoryReset.resetToFactory')}</Button>
      </div>
      {feedback ? (
        <p className={`break-words text-[11px] ${feedback.kind === 'error' ? 'text-red-400' : 'text-muted-foreground'}`}>
          {feedback.message}
        </p>
      ) : null}
      {rebootRequired ? (
        <Button
          variant="outline"
          disabled={disabled}
          title={busyReason}
          onClick={() => void run(restartBoard)}
        >
          {t('firmware.firmwarePage.restartBoard')}</Button>
      ) : null}
    </section>
  )
}
