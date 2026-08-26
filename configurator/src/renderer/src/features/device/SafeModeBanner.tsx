import { ShieldAlert } from 'lucide-react'

import { describeBootFailures, describeFailedPhase } from './device-health'
import { useDeviceStore } from './device-store'

export function SafeModeBanner(): React.JSX.Element | null {
  const health = useDeviceStore((state) => state.session?.info.health)
  if (!health?.safeMode) return null

  const phase = describeFailedPhase(health)

  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-amber-500/40 bg-amber-500/10 px-5 py-2.5 text-xs text-amber-200"
    >
      <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 flex-none" />
      <div className="min-w-0">
        <p className="font-semibold text-amber-100">Board is in safe mode</p>
        <p className="mt-0.5 text-amber-200/90">
          {describeBootFailures(health)}
          {phase ? `, the last one ${phase}` : ''}, so the board brought up the serial link on its
          own: no dashboard, no modules, and no font or image upload. Live preview is off. Save a
          configuration to it — that clears the count and restarts it into an ordinary boot.
        </p>
      </div>
    </div>
  )
}
