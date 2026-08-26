import { Radio } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PageSection, PageShell } from '@/app/workspace/PageShell'
import { DocumentStatusChip } from '@/features/device/document-status'
import { SaveToBoardButton } from '@/features/device/save-to-board-ui'
import { CatalogSection } from './CatalogSection'
import { SimHubProfileSection } from './SimHubProfileSection'
import { TransportSection } from './TransportSection'

export function ProtocolPage(): React.JSX.Element {
  return (
    <PageShell
      title="Protocol"
      description="Where telemetry comes from, how it reaches the board, and what the fields are called."
      actions={
        <>
          <DocumentStatusChip document="protocol" />
          <SaveToBoardButton />
        </>
      }
    >
      <TelemetrySourceSection />
      <SimHubProfileSection />
      <CatalogSection />
      <TransportSection />
    </PageShell>
  )
}

function TelemetrySourceSection(): React.JSX.Element {
  return (
    <PageSection
      title="Telemetry source"
      description="What produces the values the dashboard draws."
    >
      <div className="flex items-start gap-3 rounded-md border bg-muted/20 p-3">
        <Radio aria-hidden="true" className="mt-0.5 size-4 flex-none text-muted-foreground" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">SimHub</span>
            <Badge variant="outline">In use</Badge>
          </div>
          <p className="text-muted-foreground">
            A Custom Serial Device profile on the PC writes one line per field over the same link
            this configurator uses. It is the only source today; a second one would be chosen here.
          </p>
        </div>
      </div>
    </PageSection>
  )
}
