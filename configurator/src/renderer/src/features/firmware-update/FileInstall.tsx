import { ChevronRight } from 'lucide-react'
import { useState } from 'react'

import type { DeviceSession } from '@shared/device'
import { t } from '@shared/ui-text'
import { Button } from '@/components/ui/button'
import { updateBoard, useBoardUpdateStore } from './board-update-store'
import { useFirmwareUpdateStore } from './firmware-update-store'

export function FileInstall({ session }: { session: DeviceSession }): React.JSX.Element {
  const source = useFirmwareUpdateStore((state) => state.source)
  const running = useBoardUpdateStore((state) => state.running)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const firmware = session.firmware
  const installable =
    Boolean(firmware?.storageAvailable) &&
    !firmware?.rebootRequired &&
    source !== undefined &&
    !running &&
    !busy

  const select = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const result = await window.pitrig.selectFirmwareSource()
      if (!result.ok) setError(result.error.message)
      else if (result.value) {
        useFirmwareUpdateStore.getState().setSource(result.value)
        useBoardUpdateStore.getState().dismiss()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="group/file rounded-lg border text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-2 text-muted-foreground hover:text-foreground">
        <ChevronRight
          aria-hidden="true"
          className="size-3 transition-transform group-open/file:rotate-90"
        />
        {t('firmware.fileInstall.installFromAFile')}
      </summary>
      <div className="space-y-2 border-t px-2.5 py-2.5">
        <p className="text-muted-foreground">{t('firmware.fileInstall.aPitrigFirmwareFile')}</p>
        {source ? (
          <div className="flex items-center justify-between gap-2 rounded-md border p-2">
            <span className="min-w-0 truncate" title={source.name}>
              {source.name}
            </span>
            <span className="flex-none text-muted-foreground">
              {t('firmware.fileInstall.sizeBytes', { size: source.size })}
            </span>
          </div>
        ) : null}
        {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || running} onClick={() => void select()}>
            {t('firmware.fileInstall.selectFile')}</Button>
          <Button disabled={!installable} onClick={() => void updateBoard(source?.id)}>
            {t('firmware.fileInstall.install')}</Button>
        </div>
      </div>
    </details>
  )
}
