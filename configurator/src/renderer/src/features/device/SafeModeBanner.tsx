import { ShieldAlert } from 'lucide-react'

import { describeBootFailures, describeFailedPhase } from './device-health'
import { useDeviceStore } from './device-store'

/**
 * The one thing a board in safe mode has to tell whoever opened this window.
 *
 * It belongs to the window rather than to a page because it is true of every
 * page: the canvas will not preview, the Fonts and Images pages have nothing to
 * upload to, and the reason for all of it is the same. Firmware built before
 * the boot guard reports no health at all, which reads as an ordinary board and
 * shows nothing.
 */
export function SafeModeBanner(): React.JSX.Element | null {
  const health = useDeviceStore((state) => state.session?.info.health)
  if (!health?.safeMode) return null

  // The phase belongs in this sentence only while the reset that caused this
  // boot was itself a fault. Once a host restarts the board out of safe mode
  // and it lands back in it, the reset was deliberate and the phase describes
  // that restart rather than anything that went wrong.
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
