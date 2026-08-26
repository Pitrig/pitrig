import type { DeviceHealth, DeviceResetCause, DeviceStartupPhase } from '@shared/device'

const RESET_CAUSE_LABELS: Record<DeviceResetCause, string> = {
  power_on: 'Power applied',
  software: 'Restarted on request',
  panic: 'Crashed',
  task_watchdog: 'Stopped responding',
  brownout: 'Supply voltage dropped',
  other: 'Reset'
}

const FAULT_CAUSES: readonly DeviceResetCause[] = ['panic', 'task_watchdog', 'brownout']

const STARTUP_PHASE_LABELS: Record<DeviceStartupPhase, string> = {
  none: '',
  configuration: 'while reading its configuration',
  link: 'while starting the serial link',
  display: 'while bringing up the display',
  assets: 'while loading fonts and images',
  composition: 'while building the dashboard',
  complete: 'after it had finished starting'
}

export function describeFailedPhase(health: DeviceHealth): string {
  if (!FAULT_CAUSES.includes(health.resetCause)) return ''
  return STARTUP_PHASE_LABELS[health.lastPhase]
}

export function describeLastBoot(health: DeviceHealth): string {
  const cause = RESET_CAUSE_LABELS[health.resetCause]
  const phase = describeFailedPhase(health)
  return phase ? `${cause} ${phase}` : cause
}

export function describeBootFailures(health: DeviceHealth): string {
  if (health.bootFailures === 0) return 'None since the last power-on'
  return health.bootFailures === 1
    ? '1 start ended in a crash'
    : `${health.bootFailures} starts in a row ended in a crash`
}
