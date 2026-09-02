import { ShieldAlert } from 'lucide-react'

import { describeBootFailures, describeFailedPhase } from './device-health'
import { useDeviceStore } from './device-store'
import { t } from '@shared/ui-text'

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
        <p className="font-semibold text-amber-100">{t('device.safeModeBanner.boardIsInSafeMode')}</p>
        <p className="mt-0.5 text-amber-200/90">
          {t('device.safeModeBanner.explanation', {
            failures: describeBootFailures(health),
            phase: phase ? t('device.safeModeBanner.theLastOnePhase', { phase }) : ''
          })}
        </p>
      </div>
    </div>
  )
}
