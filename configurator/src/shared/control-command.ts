import type { DeviceResult } from './device'

export interface ControlCommandRequest {
  command: string
}

export interface ControlCommandValue {
  lines: string[]
}

export type ControlCommandResult = DeviceResult<ControlCommandValue>

export const MAXIMUM_CONTROL_COMMAND_LENGTH = 256

const BINARY_SESSION_COMMANDS = [/^@SC:(FONT|IMAGE|FW):BEGIN\b/i]

function isBinarySessionCommand(command: string): boolean {
  const line = command.trim()
  return BINARY_SESSION_COMMANDS.some((pattern) => pattern.test(line))
}

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
