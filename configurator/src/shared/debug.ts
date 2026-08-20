import type { DeviceResult } from './device'

// The debug workspace: what crossed the serial link, and a way to put one line
// on it by hand. Both used to be development-only — the traffic log was gated
// behind `import.meta.env.DEV` and the console did not exist. A board that
// misbehaves in a release build is exactly when this is wanted, so it ships.

export const SERIAL_TRAFFIC_CHANNEL = 'debug:serial-traffic' as const
export const CONTROL_COMMAND_CHANNEL = 'debug:control-command' as const

export interface SerialTrafficLog {
  direction: 'rx' | 'tx'
  path: string
  baudRate: number
  data: string
  encoding?: 'utf8' | 'hex'
}

export interface ControlCommandRequest {
  command: string
}

export interface ControlCommandValue {
  /** Every `@SC:` line the board answered with, in the order it sent them. */
  lines: string[]
}

export type ControlCommandResult = DeviceResult<ControlCommandValue>

/** A hand-typed command is one line; the writer adds the ending. */
export const MAXIMUM_CONTROL_COMMAND_LENGTH = 256

/**
 * The commands that open a binary stop-and-wait session on the shared link.
 *
 * Typing one of these leaves the router expecting `SCF1` frames that no console
 * can produce, and the link stays in that mode until the session times out —
 * so the console refuses them rather than letting one keystroke wedge the
 * board. The upload panels own these commands; nothing is lost by refusing
 * them here. See docs/font-assets.md for the session itself.
 */
const BINARY_SESSION_COMMANDS = [/^@SC:(FONT|IMAGE|FW):BEGIN\b/i]

export function isBinarySessionCommand(command: string): boolean {
  const line = command.trim()
  return BINARY_SESSION_COMMANDS.some((pattern) => pattern.test(line))
}

/**
 * What the console will actually put on the wire, or the reason it will not.
 * Shared so the input can say no before the round trip, and the main process
 * can say no again for the request that arrives without passing through it.
 */
export function controlCommandRefusal(command: string): string | undefined {
  const line = command.trim()
  if (line.length === 0) return 'Type a command first.'
  if (!line.startsWith('@SC:')) return 'A control command starts with "@SC:".'
  if (line.length > MAXIMUM_CONTROL_COMMAND_LENGTH) {
    return `A command is at most ${MAXIMUM_CONTROL_COMMAND_LENGTH} characters.`
  }
  if (/[\r\n]/.test(line)) return 'A command is a single line.'
  if (isBinarySessionCommand(line)) {
    return 'Upload commands open a binary session the console cannot speak. Use the upload panels.'
  }
  return undefined
}
