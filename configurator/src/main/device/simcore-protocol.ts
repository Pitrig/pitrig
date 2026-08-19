import type { SerialPort } from 'serialport'

import {
  type DeviceConfiguration,
  type DeviceErrorCode,
  type DeviceSession,
  MAXIMUM_CONFIGURATION_PAYLOAD_SIZE,
  type SimCoreBoardId
} from '@shared/device'
import { describeDeviceError } from '@shared/device-error-message'
import { parseDeviceConfigurationJson } from './configuration-json'
import {
  parseDeviceInfo,
  parseFirmwareUpdateInfo,
  parseFontAssetInfo,
  parseImageAssetInfo
} from './protocol-parsers'
import { DeviceServiceError } from './device-errors'

const PROBE_TIMEOUT_MS = 1_000
const CONFIGURATION_RESPONSE_PREFIX = '@SC:OK:CONFIG:'
// The buffer holds the one line still being received, so it has to keep the
// longest line the device sends: a GET reply, which is the prefix, a payload up
// to the contract's bound, and the line ending. A smaller bound cut the head
// off a long configuration before its newline arrived, and by the time the
// line was complete the prefix it was waiting for was gone — every dashboard
// over the old 8 KiB failed the probe as "not a SimCore device".
const MAXIMUM_RESPONSE_BUFFER_SIZE =
  CONFIGURATION_RESPONSE_PREFIX.length + MAXIMUM_CONFIGURATION_PAYLOAD_SIZE + '\r\n'.length
// The probe is the first thing written to a freshly opened port, and it opens
// with a newline of its own. A scan walks the baud rates in turn, and a request
// written at the wrong rate still reaches the device — as bytes that decode
// into garbage carrying no line ending. The next request, correct rate and all,
// is appended to that remnant and read as one unknown line, so the attempt that
// should have succeeded is the one that is lost. The leading newline closes the
// ruined line, which the device discards unrecognised, and leaves the request on
// a line of its own. Only a board reached over a USB-serial bridge ever shows
// this: a native USB link has no wrong rate to be probed at.
const INFO_REQUEST = '\n@SC:INFO\n'
const GET_REQUEST = '@SC:GET\n'
const IMAGE_INFO_REQUEST = '@SC:IMAGE:INFO\n'
const FONT_INFO_REQUEST = '@SC:FONT:INFO\n'
const FIRMWARE_INFO_REQUEST = '@SC:FW:INFO\n'
const CONFIGURATION_TIMEOUT_MS = 2_000

type TrafficCallback = (direction: 'rx' | 'tx', data: string) => void

export async function probeSimCore(
  port: SerialPort,
  onTraffic: TrafficCallback
): Promise<DeviceSession> {
  const infoLine = await requestResponse(
    port,
    INFO_REQUEST,
    '@SC:OK:INFO:',
    PROBE_TIMEOUT_MS,
    onTraffic
  )
  const info = parseDeviceInfo(infoLine)
  const configuration = await readConfiguration(port, info.boardId, onTraffic, 'not_simcore')
  if (configuration.board !== info.boardId) {
    throw new DeviceServiceError(
      'not_simcore',
      'The device configuration board does not match the connected hardware.'
    )
  }
  const fontAssets = await probeCapability(
    port,
    FONT_INFO_REQUEST,
    '@SC:OK:FONT:INFO:',
    parseFontAssetInfo,
    onTraffic
  )
  const imageAssets = await probeCapability(
    port,
    IMAGE_INFO_REQUEST,
    '@SC:OK:IMAGE:INFO:',
    parseImageAssetInfo,
    onTraffic
  )
  const firmware = await probeCapability(
    port,
    FIRMWARE_INFO_REQUEST,
    '@SC:OK:FW:INFO:',
    parseFirmwareUpdateInfo,
    onTraffic
  )
  return {
    info,
    configuration,
    ...(fontAssets ? { fontAssets } : {}),
    ...(imageAssets ? { imageAssets } : {}),
    ...(firmware ? { firmware } : {})
  }
}

export async function readConfiguration(
  port: SerialPort,
  expectedBoard: SimCoreBoardId,
  onTraffic: TrafficCallback,
  rejectionCode: DeviceErrorCode = 'configuration_rejected'
): Promise<DeviceConfiguration> {
  const line = await requestResponse(
    port,
    GET_REQUEST,
    CONFIGURATION_RESPONSE_PREFIX,
    CONFIGURATION_TIMEOUT_MS,
    onTraffic,
    rejectionCode
  )
  try {
    const configuration = parseDeviceConfigurationJson(
      line.slice(CONFIGURATION_RESPONSE_PREFIX.length)
    )
    if (configuration.board !== expectedBoard) {
      throw new Error('The device configuration board does not match the connected hardware.')
    }
    return configuration
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown configuration error.'
    throw new DeviceServiceError(rejectionCode, message)
  }
}

export async function applyConfiguration(
  port: SerialPort,
  payload: string,
  onTraffic: TrafficCallback
): Promise<void> {
  await requestResponse(
    port,
    `@SC:APPLY:${payload}\n`,
    '@SC:OK:APPLIED',
    CONFIGURATION_TIMEOUT_MS,
    onTraffic,
    'configuration_rejected'
  )
}

export async function saveConfiguration(
  port: SerialPort,
  payload: string,
  onTraffic: TrafficCallback
): Promise<void> {
  await requestResponse(
    port,
    `@SC:SET:${payload}\n`,
    '@SC:OK:SAVED:reboot_required=1',
    CONFIGURATION_TIMEOUT_MS,
    onTraffic,
    'configuration_rejected'
  )
}

export async function resetConfiguration(
  port: SerialPort,
  onTraffic: TrafficCallback
): Promise<void> {
  await requestResponse(
    port,
    '@SC:RESET\n',
    '@SC:OK:RESET:reboot_required=1',
    CONFIGURATION_TIMEOUT_MS,
    onTraffic,
    'configuration_rejected'
  )
}

export async function clearImageAssets(
  port: SerialPort,
  onTraffic: TrafficCallback
): Promise<void> {
  await requestResponse(
    port,
    '@SC:IMAGE:CLEAR\n',
    '@SC:OK:IMAGE:CLEARED:reboot_required=1',
    CONFIGURATION_TIMEOUT_MS,
    onTraffic,
    'serial_error'
  )
}

export async function clearFontAssets(
  port: SerialPort,
  onTraffic: TrafficCallback
): Promise<void> {
  await requestResponse(
    port,
    '@SC:FONT:CLEAR\n',
    '@SC:OK:FONT:CLEARED:reboot_required=1',
    CONFIGURATION_TIMEOUT_MS,
    onTraffic,
    'serial_error'
  )
}

export function requestResponse(
  port: SerialPort,
  request: string,
  responsePrefix: string,
  timeoutMs: number,
  onTraffic: TrafficCallback,
  rejectionCode: DeviceErrorCode = 'not_simcore'
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    let settled = false

    const cleanup = (): void => {
      clearTimeout(timeoutTimer)
      port.off('data', onData)
      port.off('error', onError)
      port.off('close', onClose)
      buffer = ''
    }
    const finish = (error?: Error, response?: string): void => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve(response ?? '')
    }
    const onData = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      onTraffic('rx', text)
      buffer = (buffer + text).slice(-MAXIMUM_RESPONSE_BUFFER_SIZE)
      const lines = buffer.replaceAll('\r', '').split('\n')
      buffer = lines.pop() ?? ''
      const response = lines.find((line) => line.startsWith(responsePrefix))
      if (response) {
        finish(undefined, response)
        return
      }
      const deviceError = lines.find((line) => line.startsWith('@SC:ERR:'))
      if (deviceError) {
        const token = deviceError.slice('@SC:ERR:'.length).trim()
        finish(new DeviceServiceError(rejectionCode, describeDeviceError(token), token))
      }
    }
    const onError = (error: Error): void => finish(error)
    const onClose = (): void => {
      finish(new DeviceServiceError('serial_error', 'Serial port closed during request.'))
    }
    const sendRequest = (): void => {
      if (!port.isOpen || settled) return
      port.write(request, (error) => {
        if (error) finish(error)
        else onTraffic('tx', request)
      })
    }

    port.on('data', onData)
    port.once('error', onError)
    port.once('close', onClose)
    const timeoutTimer = setTimeout(() => {
      finish(new DeviceServiceError(rejectionCode, `The device did not answer ${request.trim()}.`))
    }, timeoutMs)
    port.flush(() => sendRequest())
  })
}

/**
 * A capability the connected firmware may not have. Firmware that does not know
 * the command answers `unknown_command` — bare from the configuration control,
 * or under its namespace as `<TAG>:unknown_command` — and that is a fact about
 * the board rather than a failure, so the probe reports the capability absent
 * and the panel for it stays away.
 *
 * The reason is read from the device's own token rather than from the message:
 * the message is a translated sentence for the reader, and matching its text
 * made every probe here reject a board it was meant to accept.
 */
async function probeCapability<T>(
  port: SerialPort,
  request: string,
  responsePrefix: string,
  parse: (line: string) => T,
  onTraffic: TrafficCallback
): Promise<T | undefined> {
  try {
    const line = await requestResponse(
      port,
      request,
      responsePrefix,
      PROBE_TIMEOUT_MS,
      onTraffic
    )
    return parse(line)
  } catch (error) {
    if (isUnknownCommand(error)) {
      return undefined
    }
    throw error
  }
}

function isUnknownCommand(error: unknown): boolean {
  if (!(error instanceof DeviceServiceError) || error.token === undefined) {
    return false
  }
  return error.token.slice(error.token.lastIndexOf(':') + 1) === 'unknown_command'
}
