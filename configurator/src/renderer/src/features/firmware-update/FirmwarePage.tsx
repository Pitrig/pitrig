import { Cpu } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { EmptyState, PageSection, PageShell, ReadOnlyField } from '@/app/workspace/PageShell'
import { restartBoard, type ActionFeedback } from '@/features/configuration/configuration-actions'
import { useDeviceStore } from '@/features/device/device-store'
import { useFirmwareUpdateStore, useFirmwareUploadStore } from './firmware-update-store'
import { t } from '@shared/ui-text'

export function FirmwarePage(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const source = useFirmwareUpdateStore((state) => state.source)
  const progress = useFirmwareUploadStore((state) => state.progress)
  const error = useFirmwareUploadStore((state) => state.error)
  const running = useFirmwareUploadStore((state) => state.running)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<ActionFeedback>()

  const firmware = session?.firmware
  const uploadable =
    Boolean(source) &&
    Boolean(firmware?.storageAvailable) &&
    !firmware?.rebootRequired &&
    !running &&
    !busy

  const selectSource = async (): Promise<void> => {
    setBusy(true)
    const upload = useFirmwareUploadStore.getState()
    upload.setError(undefined)
    try {
      const result = await window.pitrig.selectFirmwareSource()
      if (!result.ok) upload.setError(result.error.message)
      else if (result.value) {
        useFirmwareUpdateStore.getState().setSource(result.value)
        upload.setProgress(undefined)
      }
    } finally {
      setBusy(false)
    }
  }

  const install = async (): Promise<void> => {
    if (!source || !useFirmwareUploadStore.getState().begin()) return
    try {
      const result = await window.pitrig.uploadFirmware({ sourceId: source.id })
      if (!result.ok) useFirmwareUploadStore.getState().setError(result.error.message)
    } finally {
      useFirmwareUploadStore.getState().end()
    }
  }

  const restart = async (): Promise<void> => {
    setFeedback(await restartBoard())
  }

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
      : 0

  return (
    <PageShell
      title={t('device.infoPage.firmware')}
      description={t('firmware.firmwarePage.installAFirmwareImageInto')}
      actions={
        firmware?.rebootRequired && !running ? (
          <Button onClick={() => void restart()}>{t('firmware.firmwarePage.restartBoard')}</Button>
        ) : null
      }
    >
      {feedback ? (
        <p
          className={`rounded-md border p-2 text-xs ${
            feedback.kind === 'error' ? 'text-red-400' : 'text-muted-foreground'
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      {firmware ? (
        <PageSection
          title={t('firmware.firmwarePage.slots')}
          description={t('firmware.firmwarePage.theImageTakesOverAt')}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <ReadOnlyField label={t('firmware.firmwarePage.running')} value={firmware.running} />
            <ReadOnlyField label={t('device.infoPage.version')} value={firmware.version} />
            <ReadOnlyField label={t('firmware.firmwarePage.installsInto')} value={firmware.target} />
          </div>
          {firmware.pendingVerify ? (
            <p className="mt-3 text-[11px] text-amber-400">
              {t('firmware.firmwarePage.thisImageHasNotBeen')}</p>
          ) : null}
          {firmware.rebootRequired ? (
            <p className="mt-3 text-[11px] text-amber-400">
              {t('firmware.firmwarePage.restartTheBoardToRun')}</p>
          ) : null}
        </PageSection>
      ) : (
        <PageSection title={t('firmware.firmwarePage.notAvailable')} description={t('firmware.firmwarePage.whatThisBoardCanDo')}>
          <EmptyState icon={<Cpu aria-hidden="true" className="size-6" />} title={t('firmware.firmwarePage.noSecondSlot')}>
            {session
              ? t('firmware.firmwarePage.theConnectedFirmwarePredatesThe')
              : t('firmware.firmwarePage.connectABoardWithTwo')}
          </EmptyState>
        </PageSection>
      )}

      <PageSection
        title={t('firmware.firmwarePage.image')}
        description={t('firmware.firmwarePage.aPackagedPitrigFirmwareImage')}
      >
        <div className="space-y-3">
          {source ? (
            <div className="flex items-center justify-between gap-2 rounded-md border p-2">
              <span className="min-w-0 truncate" title={source.name}>
                {source.name}
              </span>
              <span className="flex-none text-muted-foreground">{t('firmware.firmwarePage.sizeBytes', { size: source.size })}</span>
            </div>
          ) : (
            <p className="text-muted-foreground">{t('firmware.firmwarePage.noImageSelected')}</p>
          )}

          {progress ? (
            <div className="space-y-1.5 rounded-md border bg-muted/20 p-2 text-[11px] text-muted-foreground">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-sky-500 transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="break-words">
                {progress.message}
                {progress.total > 0 ? t('firmware.firmwarePage.percent', { percent: percent }) : ''}
              </p>
            </div>
          ) : null}
          {error ? <p className="text-[11px] text-red-400">{error}</p> : null}

          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant="outline"
              disabled={busy}
              onClick={() => void selectSource()}
            >
              {t('firmware.firmwarePage.selectImage')}</Button>
            <Button className="flex-1" disabled={!uploadable} onClick={() => void install()}>
              {running ? t('firmware.firmwarePage.installing') : t('common.install')}
            </Button>
          </div>
          {running ? (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => void window.pitrig.cancelFirmwareUpload()}
            >
              {t('common.cancel')}</Button>
          ) : null}
        </div>
      </PageSection>
    </PageShell>
  )
}
