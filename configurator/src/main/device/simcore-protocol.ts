import type { SerialPort } from 'serialport'

import {
  type DeviceConfiguration,
  type DeviceErrorCode,
  type DeviceSession,
  type FontAssetDeviceInfo,
  type SimCoreBoardId
} from '@shared/device'
import { describeDeviceError } from '@shared/device-error-message'
import { type ImageAssetState } from '@shared/image-assets'
import { parseDeviceConfigurationJson } from './configuration-json'
import {
  parseDeviceInfo,
  parseFontAssetInfo,
  parseImageAssetInfo
} from './protocol-parsers'
import { DeviceServiceError } from './device-errors'

const PROBE_TIMEOUT_MS = 1_000
const MAXIMUM_RESPONSE_BUFFER_SIZE = 8_192
const INFO_REQUEST = '@SC:INFO\n'
const GET_REQUEST = '@SC:GET\n'
const IMAGE_INFO_REQUEST = '@SC:IMAGE:INFO\n'
const FONT_INFO_REQUEST = '@SC:FONT:INFO\n'
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
  const fontAssets = await probeFontAssets(port, onTraffic)
  const imageAssets = await probeImageAssets(port, onTraffic)
  return {
    info,
    configuration,
    ...(fontAssets ? { fontAssets } : {}),
    ...(imageAssets ? { imageAssets } : {})
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
    '@SC:OK:CONFIG:',
    CONFIGURATION_TIMEOUT_MS,
    onTraffic,
    rejectionCode
  )
  try {
    const configuration = parseDeviceConfigurationJson(line.slice('@SC:OK:CONFIG:'.length))
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
        finish(
          new DeviceServiceError(
            rejectionCode,
            describeDeviceError(deviceError.slice('@SC:ERR:'.length))
          )
        )
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

async function probeFontAssets(
  port: SerialPort,
  onTraffic: TrafficCallback
): Promise<FontAssetDeviceInfo | undefined> {
  try {
    const line = await requestResponse(
      port,
      FONT_INFO_REQUEST,
      '@SC:OK:FONT:INFO:',
      PROBE_TIMEOUT_MS,
      onTraffic
    )
    return parseFontAssetInfo(line)
  } catch (error) {
    if (
      error instanceof DeviceServiceError &&
      error.code === 'not_simcore' &&
      error.message.includes('unknown_command')
    ) {
      return undefined
    }
    throw error
  }
}

/**
 * Firmware without uploaded images answers with `unknown_command`, which is a
 * fact about the board rather than a failure — the same graceful degradation
 * the font probe uses.
 */
async function probeImageAssets(
  port: SerialPort,
  onTraffic: TrafficCallback
): Promise<ImageAssetState | undefined> {
  try {
    const line = await requestResponse(
      port,
      IMAGE_INFO_REQUEST,
      '@SC:OK:IMAGE:INFO:',
      PROBE_TIMEOUT_MS,
      onTraffic
    )
    return parseImageAssetInfo(line)
  } catch (error) {
    if (
      error instanceof DeviceServiceError &&
      error.code === 'not_simcore' &&
      error.message.includes('unknown_command')
    ) {
      return undefined
    }
    throw error
  }
}
