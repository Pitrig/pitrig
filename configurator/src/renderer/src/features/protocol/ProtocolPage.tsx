import { Radio } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PageSection, PageShell } from '@/app/workspace/PageShell'
import { DocumentStatusChip } from '@/features/device/document-status'
import { SaveToBoardButton } from '@/features/device/save-to-board-ui'
import { CatalogSection } from './CatalogSection'
import { SimHubProfileSection } from './SimHubProfileSection'
import { TransportSection } from './TransportSection'

/**
 * The link between the PC and the board: what feeds it, how it is carried, and
 * what the fields on it are called.
 *
 * The transport half edits the draft rather than the board directly, and what
 * it edits is the board's `protocol` configuration: its own stored document,
 * saved on its own and never rewritten by a dashboard edit. It is also the one
 * document a restart has to bring into force — the link is chosen once at
 * startup — which is why saving from here restarts the board and saving a
 * dashboard does not.
 */



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
      {/* Last and folded away: this is the section an author reads once when a
          board is first set up, and the one that can cut the board off. */}
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

/**
 * The transport properties, out of the raw JSON and into named controls.
 *
 * The pins are behind a fold because they are the one pair of values that can
 * make a board unreachable: firmware validates them against the board's own
 * pin pair and rejects a document that names another, so a wrong number here is
 * a refused save rather than a silent break — but it is still not a number
 * anyone edits by accident.
 */
