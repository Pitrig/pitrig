import { Radio } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PageSection, PageShell } from '@/app/workspace/PageShell'
import { DocumentStatusChip } from '@/features/device/document-status'
import { SaveToBoardButton } from '@/features/device/save-to-board-ui'
import { BridgeSection } from './BridgeSection'
import { CatalogSection } from './CatalogSection'
import { SimHubProfileSection } from './SimHubProfileSection'
import { TransportSection } from './TransportSection'
import { t } from '@shared/ui-text'

export function ProtocolPage(): React.JSX.Element {
  return (
    <PageShell
      title={t('documents.label.protocol')}
      description={t('protocol.protocolPage.whereTelemetryComesFromHow')}
      actions={
        <>
          <DocumentStatusChip document="protocol" />
          <SaveToBoardButton />
        </>
      }
    >
      <TelemetrySourceSection />
      <BridgeSection />
      <SimHubProfileSection />
      <CatalogSection />
      <TransportSection />
    </PageShell>
  )
}

function TelemetrySourceSection(): React.JSX.Element {
  return (
    <PageSection
      title={t('protocol.protocolPage.telemetrySource')}
      description={t('protocol.protocolPage.whatProducesTheValuesThe')}
    >
      <div className="flex items-start gap-3 rounded-md border bg-muted/20 p-3">
        <Radio aria-hidden="true" className="mt-0.5 size-4 flex-none text-muted-foreground" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{t('protocol.protocolPage.simHub')}</span>
            <Badge variant="outline">{t('protocol.protocolPage.inUse')}</Badge>
          </div>
          <p className="text-muted-foreground">
            {t('protocol.protocolPage.aCustomSerialDeviceProfile')}</p>
        </div>
      </div>
    </PageSection>
  )
}
