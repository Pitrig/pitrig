import { Puzzle } from 'lucide-react'

import { EmptyState, PageSection, PageShell } from '@/app/workspace/PageShell'
import { DocumentStatusChip } from '@/features/device/document-status'
import { SaveToBoardButton } from '@/features/device/save-to-board-ui'

/**
 * Where peripherals will be configured — buttons, encoders, LEDs and whatever
 * else a board grows.
 *
 * It is empty on purpose rather than hidden. The board already stores a
 * `modules` configuration of its own, separately from the dashboard and the
 * protocol: the section inside it is declared, bounded, and rejected while it is
 * non-empty, precisely because no peripheral driver has a production contract
 * yet. A page that says so is the honest state of it, and it is where the first
 * one will appear — costing neither the dashboard's bytes nor its restarts when
 * it does.
 */
export function ModulesPage(): React.JSX.Element {
  return (
    <PageShell
      title="Modules"
      description="Peripherals beyond the display: buttons, encoders and LEDs."
      actions={
        <>
          <DocumentStatusChip document="modules" />
          <SaveToBoardButton />
        </>
      }
    >
      <PageSection
        title="Nothing to configure yet"
        description="This is where the board's extra hardware will be set up."
      >
        <EmptyState icon={<Puzzle aria-hidden="true" className="size-6" />} title="No modules">
          <p>
            The board stores a <code className="font-mono">modules</code> configuration beside the
            dashboard and the protocol, and the firmware rejects it while it holds anything: no
            peripheral driver has a complete contract yet, so a value here would be a guess rather
            than a setting.
          </p>
          <p className="mt-2">
            Buttons, encoders and LEDs will appear on this page as their drivers land. Until then a
            widget can still react to a touch — give it an action on the Dashboard page.
          </p>
        </EmptyState>
      </PageSection>
    </PageShell>
  )
}
