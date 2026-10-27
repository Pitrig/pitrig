import { Button } from '@/components/ui/button'
import { useDeviceStore } from '@/features/device/device-store'
import { useBoardUpdateStore } from '@/features/firmware-update/board-update-store'
import { boardBehind } from '@shared/app-updates'
import { updateBoardFromRelease, useUpdateStore } from './update-store'
import { t } from '@shared/ui-text'

export function ReleaseFirmwareOffer(): React.JSX.Element | null {
  const status = useUpdateStore((state) => state.status)
  const preparing = useUpdateStore((state) => state.preparing)
  const session = useDeviceStore((state) => state.session)
  const updating = useBoardUpdateStore((state) => state.running)
  if (!status?.enabled || !boardBehind(session, status.releasedFirmware)) return null

  const downloading = status.firmwareDownload
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2">
      <p className="min-w-0 text-[11px] text-emerald-100">
        {downloading !== undefined
          ? t('updates.firmware.downloading', { progress: downloading })
          : t('updates.firmware.offer', { version: status.releasedFirmware })}
      </p>
      <Button
        className="flex-none"
        disabled={preparing || updating}
        onClick={() => void updateBoardFromRelease()}
      >
        {t('updates.firmware.downloadAndUpdate')}
      </Button>
    </div>
  )
}
