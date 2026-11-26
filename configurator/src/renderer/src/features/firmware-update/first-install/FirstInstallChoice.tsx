import { PITRIG_BOARD_IDS, type PitrigBoardId } from '@shared/device'
import { t } from '@shared/ui-text'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { BOARD_NAMES } from '@/features/configuration/board-labels'
import {
  chooseInstall,
  closeFirstInstall,
  startFirstInstall,
  useFirstInstallStore,
  usePortPolling
} from './first-install-store'

const BOARD_OPTIONS = PITRIG_BOARD_IDS.map((board) => ({ value: board, label: BOARD_NAMES[board] }))

export function FirstInstallChoice(): React.JSX.Element {
  const board = useFirstInstallStore((state) => state.board)
  const portId = useFirstInstallStore((state) => state.portId)
  usePortPolling()

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-muted-foreground">{t('device.infoPage.board')}</span>
        <Select
          className="w-full"
          value={board ?? ''}
          options={BOARD_OPTIONS}
          placeholder={t('firmware.firstInstall.choose')}
          aria-label={t('device.infoPage.board')}
          onChange={(value) => chooseInstall({ board: value as PitrigBoardId })}
        />
      </label>
      <PortChoice />
      {board ? (
        <p className="text-muted-foreground">{t(`firmware.firstInstall.connector.${board}`)}</p>
      ) : null}
      <p className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-amber-200">
        {t('firmware.firstInstall.eraseWarning')}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={closeFirstInstall}>
          {t('common.cancel')}
        </Button>
        <Button disabled={!board || !portId} onClick={() => void startFirstInstall(false)}>
          {t('firmware.firstInstall.start')}
        </Button>
      </div>
    </div>
  )
}

export function PortChoice(): React.JSX.Element {
  const ports = useFirstInstallStore((state) => state.ports)
  const portId = useFirstInstallStore((state) => state.portId)
  if (ports.length === 0) {
    return <p className="text-muted-foreground">{t('firmware.firstInstall.noPorts')}</p>
  }
  return (
    <label className="block space-y-1">
      <span className="text-muted-foreground">{t('device.infoPage.port')}</span>
      <Select
        className="w-full"
        value={portId ?? ''}
        options={ports.map((port) => ({ value: port.id, label: port.displayName }))}
        placeholder={t('firmware.firstInstall.choose')}
        aria-label={t('device.infoPage.port')}
        onChange={(value) => chooseInstall({ portId: value })}
      />
    </label>
  )
}
