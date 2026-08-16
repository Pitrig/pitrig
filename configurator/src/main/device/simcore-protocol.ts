import type { SerialPort } from 'serialport'

import {
  BOARD_PROFILES,
  CONFIGURATION_SCHEMA_VERSION,
  SIMCORE_BOARD_IDS,
  type DeviceConfiguration,
  type DeviceErrorCode,
  type DeviceInfo,
  type DeviceSession,
  type FontAssetDeviceInfo,
  type SimCoreBoardId
} from '../../shared/device'
import { FONT_FAMILY_PATTERN, MAXIMUM_FONT_FAMILIES } from '../../shared/font-assets'
import { parseDeviceConfigurationJson } from './configuration-json'
import { DeviceServiceError } from './device-errors'

const PROBE_TIMEOUT_MS = 1_000
const MAXIMUM_RESPONSE_BUFFER_SIZE = 8_192
const INFO_REQUEST = '@SC:INFO\n'
const GET_REQUEST = '@SC:GET\n'
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
  return { info, configuration, ...(fontAssets ? { fontAssets } : {}) }
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
            `SimCore rejected the request: ${deviceError.slice('@SC:ERR:'.length)}`
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

function parseDeviceInfo(line: string): DeviceInfo {
  const fields = parseFields(line, '@SC:OK:INFO:', 'INFO data')
  const board = fields.get('board') as SimCoreBoardId | undefined
  if (board === undefined || !SIMCORE_BOARD_IDS.includes(board)) {
    throw new DeviceServiceError('not_simcore', `Unsupported SimCore board: ${board ?? 'unknown'}.`)
  }
  if (fields.get('schema') !== String(CONFIGURATION_SCHEMA_VERSION)) {
    throw new DeviceServiceError(
      'not_simcore',
      `Unsupported configuration schema: ${fields.get('schema') ?? 'unknown'}.`
    )
  }
  const source = fields.get('source')
  const generation = Number(fields.get('generation'))
  const firmwareVersion = fields.get('firmware')
  if (
    !firmwareVersion ||
    (source !== 'factory' && source !== 'slot_a' && source !== 'slot_b') ||
    !Number.isSafeInteger(generation) ||
    generation < 0 ||
    !isBooleanField(fields.get('storage'))
  ) {
    throw new DeviceServiceError('not_simcore', 'The device returned malformed INFO data.')
  }
  return {
    boardId: board,
    firmwareVersion,
    schemaVersion: CONFIGURATION_SCHEMA_VERSION,
    display: BOARD_PROFILES[board].display,
    configurationSource: source,
    generation,
    storageAvailable: fields.get('storage') === '1'
  }
}

function parseFontAssetInfo(line: string): FontAssetDeviceInfo {
  const fields = parseFields(line, '@SC:OK:FONT:INFO:', 'font status')
  const formatVersion = Number(fields.get('format'))
  const familyCount = Number(fields.get('families'))
  const packageSize = Number(fields.get('size'))
  const packageAvailable = fields.get('package') === '1'
  const families = parseFontFamilies(fields.get('entries'))
  if (
    !isBooleanField(fields.get('storage')) ||
    !isBooleanField(fields.get('package')) ||
    !Number.isSafeInteger(formatVersion) || formatVersion < 0 || formatVersion > 0xffff ||
    !Number.isSafeInteger(familyCount) || familyCount < 0 ||
    familyCount > MAXIMUM_FONT_FAMILIES ||
    (fields.has('entries') && families.length !== familyCount) ||
    !Number.isSafeInteger(packageSize) || packageSize < 0 || packageSize > 2 * 1024 * 1024 ||
    (packageAvailable
      ? formatVersion !== 3 || packageSize < 4096
      : formatVersion !== 0 || familyCount !== 0 || packageSize !== 0) ||
    !isBooleanField(fields.get('reboot_required'))
  ) {
    throw new DeviceServiceError('not_simcore', 'The device returned malformed font status.')
  }
  return {
    storageAvailable: fields.get('storage') === '1',
    packageAvailable,
    formatVersion,
    familyCount,
    families,
    packageSize,
    rebootRequired: fields.get('reboot_required') === '1'
  }
}

function parseFontFamilies(value: string | undefined): string[] {
  if (value === undefined || value === '') return []
  const families: string[] = []
  for (const family of value.split(';')) {
    if (!FONT_FAMILY_PATTERN.test(family) || families.includes(family)) {
      throw new DeviceServiceError('not_simcore', 'The device returned malformed font entries.')
    }
    families.push(family)
  }
  return families
}

function parseFields(line: string, prefix: string, fieldName: string): Map<string, string> {
  const fields = new Map<string, string>()
  for (const entry of line.slice(prefix.length).split(',')) {
    const separator = entry.indexOf('=')
    if (separator <= 0) {
      throw new DeviceServiceError(
        'not_simcore',
        `The device returned malformed ${fieldName}.`
      )
    }
    fields.set(entry.slice(0, separator), entry.slice(separator + 1))
  }
  return fields
}

function isBooleanField(value: string | undefined): boolean {
  return value === '0' || value === '1'
}
