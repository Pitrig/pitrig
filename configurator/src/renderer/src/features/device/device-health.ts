import type { DeviceHealth, DeviceResetCause } from '@shared/device'
import { t } from '@shared/ui-text'

const FAULT_CAUSES: readonly DeviceResetCause[] = ['panic', 'task_watchdog', 'brownout']

export function describeFailedPhase(health: DeviceHealth): string {
  if (!FAULT_CAUSES.includes(health.resetCause)) return ''
  if (health.lastPhase === 'none') return ''
  return t(`device.health.phase.${health.lastPhase}`)
}

export function describeLastBoot(health: DeviceHealth): string {
  const cause = t(`device.health.cause.${health.resetCause}`)
  const phase = describeFailedPhase(health)
  return phase ? t('device.health.lastBoot', { cause, phase }) : cause
}

export function describeBootFailures(health: DeviceHealth): string {
  if (health.bootFailures === 0) return t('device.health.noFailures')
  return t('device.health.crashCount', { count: health.bootFailures })
}
