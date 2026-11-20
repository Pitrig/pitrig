import { t } from '@shared/ui-text'

import { PageShell } from '@/app/workspace/PageShell'
import { UpdatesSection } from '@/features/updates/UpdatesSection'
import { UsageSection } from '@/features/updates/UsageSection'
import { BoardHealthLine } from './BoardHealthLine'
import { useDeviceStore } from './device-store'
import { SupportDetails } from './SupportDetails'

export function InfoPage(): React.JSX.Element {
  const health = useDeviceStore((state) => state.session?.info.health)

  return (
    <PageShell title={t('device.infoPage.info')} description={t('device.infoPage.versionsUpdatesAndWhat')}>
      <div className="flex flex-col gap-[11px]">
        <UpdatesSection />
        {health ? <BoardHealthLine health={health} /> : null}
        <SupportDetails />
        <UsageSection />
      </div>
    </PageShell>
  )
}
