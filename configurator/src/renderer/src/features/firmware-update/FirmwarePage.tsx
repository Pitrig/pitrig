import { PageShell } from '@/app/workspace/PageShell'
import { Button } from '@/components/ui/button'
import { useDeviceStore } from '@/features/device/device-store'
import { DisplayPanelSection } from './DisplayPanelSection'
import { FactoryResetSection } from './FactoryResetSection'
import { FileInstall } from './FileInstall'
import { FirmwareStatus, UpdateOutcome, UpdateProgressCard } from './FirmwareStatus'
import { useBoardUpdateStore } from './board-update-store'
import { FirstInstallDialog } from './first-install/FirstInstallDialog'
import { openFirstInstall } from './first-install/first-install-store'
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
          <DisplayPanelSection blocked={running} />
          <FactoryResetSection blocked={running} />
        </>
      ) : running ? (
        <UpdateProgressCard />
      ) : (
        <section className="space-y-2 rounded-xl border bg-card px-4 py-3.5 text-xs text-muted-foreground shadow-sm">
          <p>{t('firmware.firmwarePage.connectABoardToSee')}</p>
          <p>{t('firmware.firstInstall.factoryHint')}</p>
          <Button className="text-foreground" variant="outline" onClick={() => openFirstInstall()}>
            {t('firmware.firstInstall.open')}
          </Button>
          <UpdateOutcome />
        </section>
      )}
      <FirstInstallDialog />
    </PageShell>
  )
}
