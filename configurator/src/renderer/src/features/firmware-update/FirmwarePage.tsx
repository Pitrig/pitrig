import { Cpu } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { EmptyState, PageSection, PageShell, ReadOnlyField } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { BoardUpdateSteps } from './BoardUpdateSteps'
import { updateBoard, useBoardUpdateStore } from './board-update-store'
import { useFirmwareUpdateStore } from './firmware-update-store'
import { ReleaseFirmwareOffer } from '@/features/updates/ReleaseFirmwareOffer'
import { t } from '@shared/ui-text'

const OUTCOME_STYLE = {
  success: 'text-muted-foreground',
  warning: 'text-amber-400',
  error: 'text-red-400'
} as const

export function FirmwarePage(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const source = useFirmwareUpdateStore((state) => state.source)
  const running = useBoardUpdateStore((state) => state.running)
  const progress = useBoardUpdateStore((state) => state.progress)
  const outcome = useBoardUpdateStore((state) => state.outcome)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const firmware = session?.firmware
  const pending = firmware?.rebootRequired ?? false
  const updatable =
    Boolean(firmware?.storageAvailable) && (pending || Boolean(source)) && !running && !busy

  const selectSource = async (): Promise<void> => {
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
    <PageShell
      title={t('device.infoPage.firmware')}
      description={t('firmware.firmwarePage.installAFirmwareImageInto')}
    >
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
          {pending && !running ? (
            <p className="mt-3 text-[11px] text-amber-400">
              {t('firmware.firmwarePage.anImageIsWaiting')}</p>
          ) : null}
        </PageSection>
      ) : running ? null : (
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
          <ReleaseFirmwareOffer />
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

          {running ? <BoardUpdateSteps progress={progress} /> : null}
          {outcome && !running ? (
            <p className={`break-words text-[11px] ${OUTCOME_STYLE[outcome.kind]}`}>{outcome.message}</p>
          ) : null}
          {error ? <p className="text-[11px] text-red-400">{error}</p> : null}

          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant="outline"
              disabled={busy || running}
              onClick={() => void selectSource()}
            >
              {t('firmware.firmwarePage.selectImage')}</Button>
            <Button
              className="flex-1"
              disabled={!updatable}
              onClick={() => void updateBoard(pending ? undefined : source?.id)}
            >
              {running
                ? t('firmware.firmwarePage.updating')
                : pending
                  ? t('firmware.firmwarePage.restartIntoTheInstalledImage')
                  : t('firmware.firmwarePage.updateBoard')}
            </Button>
          </div>
          {running && progress?.step === 'install' ? (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => void window.pitrig.cancelFirmwareUpload()}
            >
              {t('common.cancel')}</Button>
          ) : null}
          <p className="text-[11px] text-muted-foreground">{t('firmware.firmwarePage.updateKeepsTheConfiguration')}</p>
        </div>
      </PageSection>
    </PageShell>
  )
}
