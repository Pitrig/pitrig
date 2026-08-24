import type { DeviceHealth, DeviceResetCause, DeviceStartupPhase } from '@shared/device'

/**
 * How a board's last boot reads to a person rather than to the protocol.
 *
 * Two fields describe two different boots: the cause is why *this* boot
 * happened, and the phase is what the boot before it was doing when it stopped.
 * They only belong in one sentence when the cause is a fault — then the phase
 * is what the previous boot died in, and on a board that keeps dying it is the
 * half that says what to change. A deliberate restart, or power being applied,
 * says nothing about a phase and is left as the bare fact it is.
 */
const RESET_CAUSE_LABELS: Record<DeviceResetCause, string> = {
  power_on: 'Power applied',
  software: 'Restarted on request',
  panic: 'Crashed',
  task_watchdog: 'Stopped responding',
  brownout: 'Supply voltage dropped',
  other: 'Reset'
}

/** The causes that are a fault, and so have a phase worth naming. */
const FAULT_CAUSES: readonly DeviceResetCause[] = ['panic', 'task_watchdog', 'brownout']

/**
 * Named for what the board was doing rather than for the code that was running.
 * Whoever reads this is trying to work out what to change, and "loading fonts
 * and images" is a better clue than the name of a startup phase.
 */
const STARTUP_PHASE_LABELS: Record<DeviceStartupPhase, string> = {
  none: '',
  configuration: 'while reading its configuration',
  link: 'while starting the serial link',
  display: 'while bringing up the display',
  assets: 'while loading fonts and images',
  composition: 'while building the dashboard',
  complete: 'after it had finished starting'
}

/** What the previous boot was doing, or nothing when that is not knowable. */
export function describeFailedPhase(health: DeviceHealth): string {
  if (!FAULT_CAUSES.includes(health.resetCause)) return ''
  return STARTUP_PHASE_LABELS[health.lastPhase]
}

/** One sentence for how the board got to this boot. */
export function describeLastBoot(health: DeviceHealth): string {
  const cause = RESET_CAUSE_LABELS[health.resetCause]
  const phase = describeFailedPhase(health)
  return phase ? `${cause} ${phase}` : cause
}

/** What the fault counter has reached. Reset by a power-on or by any save. */
export function describeBootFailures(health: DeviceHealth): string {
  if (health.bootFailures === 0) return 'None since the last power-on'
  return health.bootFailures === 1
    ? '1 start ended in a crash'
    : `${health.bootFailures} starts in a row ended in a crash`
}
