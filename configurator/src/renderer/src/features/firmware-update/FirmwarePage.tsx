import { PageShell } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { FactoryResetSection } from './FactoryResetSection'
import { FileInstall } from './FileInstall'
import { FirmwareStatus, UpdateOutcome, UpdateProgressCard } from './FirmwareStatus'
import { useBoardUpdateStore } from './board-update-store'
import { t } from '@shared/ui-text'

export function FirmwarePage(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const running = useBoardUpdateStore((state) => state.running)

  return (
    <PageShell
      title={t('device.infoPage.firmware')}
      description={t('firmware.firmwarePage.keepTheBoardsFirmware')}
    >
      {session ? (
        <>
          <FirmwareStatus session={session} />
          {session.firmware?.storageAvailable ? <FileInstall session={session} /> : null}
          <FactoryResetSection blocked={running} />
        </>
      ) : running ? (
        <UpdateProgressCard />
      ) : (
        <section className="rounded-xl border bg-card px-4 py-3.5 text-xs text-muted-foreground shadow-sm">
          <p>{t('firmware.firmwarePage.connectABoardToSee')}</p>
          <UpdateOutcome className="mt-2" />
        </section>
      )}
    </PageShell>
  )
}
