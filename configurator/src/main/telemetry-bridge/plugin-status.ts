import {
  PLUGIN_INPUT_MARKER,
  PLUGIN_STATUS_MARKER,
  type PluginBoard,
  type PluginInput,
  type PluginStatus
} from '@shared/telemetry-bridge'

export function isPluginStatus(payload: Buffer): boolean {
  return payload.toString('latin1', 0, PLUGIN_STATUS_MARKER.length) === PLUGIN_STATUS_MARKER
}

export function isPluginInput(payload: Buffer): boolean {
  return payload.toString('latin1', 0, PLUGIN_INPUT_MARKER.length) === PLUGIN_INPUT_MARKER
}

export function parsePluginInput(text: string): PluginInput {
  const values = new Map<string, string>()
  const pressed: string[] = []
  for (const line of text.split('\n').slice(1)) {
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator)
    const value = line.slice(separator + 1)
    if (key === 'pressed') pressed.push(value)
    else values.set(key, value)
  }
  const input = values.get('input')
  const action = Number.parseInt(values.get('action') ?? '', 10)
  const down = values.get('down')
  return {
    ...(input === undefined ? {} : { input }),
    ...(Number.isInteger(action) ? { action } : {}),
    ...(down === undefined ? {} : { down: down === '1' }),
    actions: countOf(values.get('actions')),
    buttons: countOf(values.get('buttons')),
    position: countOf(values.get('switch')),
    pressed
  }
}

function countOf(value: string | undefined): number {
  const number = Number.parseInt(value ?? '', 10)
  return Number.isInteger(number) && number >= 0 ? number : 0
}

export function parsePluginStatus(text: string): PluginStatus {
  const values = new Map<string, string>()
  for (const line of text.split('\n').slice(1)) {
    const separator = line.indexOf('=')
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1).trim())
  }
  return {
    version: values.get('version') ?? '',
    acknowledged: Number.parseInt(values.get('ack') ?? '', 10) || 0,
    boards: listOf(values.get('boards')).flatMap(boardOf),
    released: listOf(values.get('released')),
    busy: listOf(values.get('busy'))
  }
}

function listOf(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function boardOf(entry: string): PluginBoard[] {
  const at = entry.indexOf('@')
  if (at <= 0) return []
  const colon = entry.indexOf(':', at)
  const baudRate = Number.parseInt(entry.slice(at + 1, colon < 0 ? undefined : colon), 10)
  if (!Number.isInteger(baudRate) || baudRate <= 0) return []
  return [{ path: entry.slice(0, at), baudRate, board: colon < 0 ? '' : entry.slice(colon + 1) }]
}
