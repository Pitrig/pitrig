import type { SerialPort } from 'serialport'

import { MAXIMUM_CONFIGURATION_PAYLOAD_SIZE, type DeviceErrorCode } from '@shared/device'
import { describeDeviceError } from '@shared/device-error-message'
import { DeviceServiceError } from './device-errors'
import { exchangeLines, type LineSend } from './line-exchange'
import { t } from '@shared/ui-text'
import { CONTROL_PREFIX } from '@shared/control-protocol'

export type TrafficCallback = (direction: 'rx' | 'tx', data: string) => void

export const CONFIGURATION_RESPONSE_PREFIX = `${CONTROL_PREFIX}OK:CONFIG:`
const MAXIMUM_RESPONSE_BUFFER_SIZE =
  CONFIGURATION_RESPONSE_PREFIX.length +
  'dashboard:'.length +
  MAXIMUM_CONFIGURATION_PAYLOAD_SIZE +
  '\r\n'.length
const CONTROL_COMMAND_TIMEOUT_MS = 3_000
const DEVICE_ERROR_PREFIX = `${CONTROL_PREFIX}ERR:`
const REPLY_PREFIX = `${CONTROL_PREFIX}OK:`
const REQUEST_LABEL_PARTS = 3
const BUSY_TOKEN = 'busy'
const BUSY_RETRY_MS = 20
const BUSY_RETRY_MAXIMUM_MS = 250
const UPLOAD_NAMESPACES: readonly string[] = ['FONT', 'IMAGE', 'FW']

type Reply = { line: string } | { token: string }

export async function requestResponse(
  port: SerialPort,
  request: string,
  responsePrefix: string,
  timeoutMs: number,
  onTraffic: TrafficCallback,
  refusalCode: DeviceErrorCode = 'not_pitrig',
  busyMs = timeoutMs
): Promise<string> {
  const line = onFreshLine(request)
  const busyUntil = Date.now() + busyMs
  let retryMs = BUSY_RETRY_MS
  for (;;) {
    const reply = await exchangeReply(port, line, responsePrefix, timeoutMs, onTraffic)
    if ('line' in reply) return reply.line
    if (!isBusyToken(line, reply.token)) {
      throw new DeviceServiceError(refusalCode, describeDeviceError(reply.token), reply.token)
    }
    if (Date.now() + retryMs >= busyUntil) {
      throw new DeviceServiceError(
        'board_busy',
        t('device.serialRequest.theBoardStayedBusy', { request: requestLabel(line) }),
        reply.token
      )
    }
    await pause(retryMs)
    retryMs = Math.min(retryMs * 2, BUSY_RETRY_MAXIMUM_MS)
  }
}

export async function sendControlCommand(
  port: SerialPort,
  command: string,
  onTraffic: TrafficCallback
): Promise<string[]> {
  const line = onFreshLine(`${command}\n`)
  const busyUntil = Date.now() + CONTROL_COMMAND_TIMEOUT_MS
  let retryMs = BUSY_RETRY_MS
  for (;;) {
    const lines = await exchangeCommand(port, line, onTraffic)
    const token = errorToken(lines.at(-1) ?? '')
    if (token === undefined || !isBusyToken(line, token) || Date.now() + retryMs >= busyUntil) {
      return lines
    }
    await pause(retryMs)
    retryMs = Math.min(retryMs * 2, BUSY_RETRY_MAXIMUM_MS)
  }
}

export function isBusyToken(request: string, token: string): boolean {
  const trimmed = token.trim()
  if (trimmed === BUSY_TOKEN) return true
  const named = namespaceOf(trimmed)
  return named !== undefined && trimmed === `${named}:${BUSY_TOKEN}` && answers(request, trimmed)
}

function exchangeReply(
  port: SerialPort,
  line: string,
  responsePrefix: string,
  timeoutMs: number,
  onTraffic: TrafficCallback
): Promise<Reply> {
  return exchangeLines<Reply>(port, {
    timeoutMs,
    bufferLimit: MAXIMUM_RESPONSE_BUFFER_SIZE,
    onReceive: (text) => onTraffic('rx', text),
    consume: (lines) => {
      const response = lines.find((received) => received.startsWith(responsePrefix))
      if (response) return { value: { line: response } }
      for (const received of lines) {
        const token = errorToken(received)
        if (token !== undefined && answers(line, token)) return { value: { token } }
      }
      return undefined
    },
    onTimeout: () => ({
      error: new DeviceServiceError(
        'no_answer',
        t('device.serialRequest.theDeviceDidNotAnswer', { trim: requestLabel(line) })
      )
    }),
    onClose: () =>
      new DeviceServiceError('serial_error', t('device.serialRequest.serialPortClosedDuringRequest')),
    send: (link) => writeRequest(port, line, onTraffic, link)
  })
}

function exchangeCommand(
  port: SerialPort,
  line: string,
  onTraffic: TrafficCallback
): Promise<string[]> {
  const collected: string[] = []
  return exchangeLines<string[]>(port, {
    timeoutMs: CONTROL_COMMAND_TIMEOUT_MS,
    bufferLimit: MAXIMUM_RESPONSE_BUFFER_SIZE,
    onReceive: (text) => onTraffic('rx', text),
    consume: (lines) => {
      for (const received of lines) {
        if (!received.startsWith(CONTROL_PREFIX)) continue
        collected.push(received)
        const token = errorToken(received)
        if (received.startsWith(REPLY_PREFIX) || (token !== undefined && answers(line, token))) {
          return { value: collected }
        }
      }
      return undefined
    },
    onTimeout: () => ({ value: collected }),
    onClose: () =>
      new DeviceServiceError('serial_error', t('device.serialRequest.serialPortClosedDuringThe')),
    send: (link) => writeRequest(port, line, onTraffic, link)
  })
}

function writeRequest(
  port: SerialPort,
  line: string,
  onTraffic: TrafficCallback,
  { fail, isSettled, arm }: LineSend
): void {
  if (!port.isOpen) {
    fail(new DeviceServiceError('serial_error', t('device.serialRequest.theSerialPortIsClosed')))
    return
  }
  port.drain((drainError) => {
    if (drainError) {
      fail(drainError)
      return
    }
    if (isSettled()) return
    port.flush((flushError) => {
      if (flushError) {
        fail(flushError)
        return
      }
      if (!port.isOpen || isSettled()) return
      arm()
      port.write(line, (error) => {
        if (error) fail(error)
        else onTraffic('tx', line)
      })
    })
  })
}

function onFreshLine(request: string): string {
  return `\n${request.replace(/^\n+/, '')}`
}

function errorToken(line: string): string | undefined {
  return line.startsWith(DEVICE_ERROR_PREFIX)
    ? line.slice(DEVICE_ERROR_PREFIX.length).trim()
    : undefined
}

function namespaceOf(text: string): string | undefined {
  const separator = text.indexOf(':')
  const head = separator < 0 ? text : text.slice(0, separator)
  return UPLOAD_NAMESPACES.includes(head) ? head : undefined
}

function answers(request: string, token: string): boolean {
  const body = request.trim()
  const asked = body.startsWith(CONTROL_PREFIX)
    ? namespaceOf(body.slice(CONTROL_PREFIX.length))
    : undefined
  const named = namespaceOf(token)
  if (named === undefined) return true
  if (asked === undefined) return false
  return named === asked || token === `${named}:${BUSY_TOKEN}`
}

function requestLabel(request: string): string {
  const line = request.trim()
  const parts = line.split(':')
  return parts.length > REQUEST_LABEL_PARTS
    ? parts.slice(0, REQUEST_LABEL_PARTS).join(':')
    : line
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
