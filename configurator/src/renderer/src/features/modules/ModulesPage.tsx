import { Puzzle } from 'lucide-react'

import { EmptyState, PageSection, PageShell } from '@/app/workspace/PageShell'

/**
 * Where peripherals will be configured — buttons, encoders, LEDs and whatever
 * else a board grows.
 *
 * It is empty on purpose rather than hidden. The configuration contract already
 * carries the section they will live in: `hardware` is declared, bounded, and
 * rejected while it is non-empty, precisely because no peripheral driver has a
 * production contract yet. A page that says so is the honest state of it, and
 * it is where the first one will appear.
 */
export function ModulesPage(): React.JSX.Element {
  return (
    <PageShell
      title="Modules"
      description="Peripherals beyond the display: buttons, encoders and LEDs."
    >
      <PageSection
        title="Nothing to configure yet"
        description="This is where the board's extra hardware will be set up."
      >
        <EmptyState icon={<Puzzle aria-hidden="true" className="size-6" />} title="No modules">
          <p>
            The configuration document reserves a <code className="font-mono">hardware</code>{' '}
            section for peripherals, and the firmware rejects it while it holds anything: no
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
