import type { SerialPort } from 'serialport'

import {
  type DeviceConfiguration,
  type DeviceErrorCode,
  type PitrigBoardId
} from '@shared/device'
import {
  CONFIGURATION_DOCUMENTS,
  CONFIGURATION_DOCUMENT_IDS,
  type ConfigurationDocumentId
} from '@shared/configuration-schema'
import { mergeDocuments } from '@shared/configuration-documents'
import { parseDeviceConfigurationJson } from './configuration-json'
import { DeviceServiceError } from './device-errors'
import {
  CONFIGURATION_RESPONSE_PREFIX,
  requestResponse,
  type TrafficCallback
} from './serial-request'

export { requestResponse, sendControlCommand } from './serial-request'

const CONFIGURATION_TIMEOUT_MS = 2_000
const RESET_TIMEOUT_MS = 5_000
const ASSET_CLEAR_TIMEOUT_MS = 30_000

function configurationTimeout(port: SerialPort, payloadBytes: number): number {
  const baud = Math.max(port.baudRate, 9_600)
  const transferMs = Math.ceil((payloadBytes * 10 * 1_000) / baud)
  return CONFIGURATION_TIMEOUT_MS + 2 * transferMs
}

async function readConfigurationDocument(
  port: SerialPort,
  document: ConfigurationDocumentId,
  expectedBoard: PitrigBoardId,
  onTraffic: TrafficCallback,
  rejectionCode: DeviceErrorCode = 'configuration_rejected'
): Promise<DeviceConfiguration> {
  const prefix = `${CONFIGURATION_RESPONSE_PREFIX}${document}:`
  const line = await requestResponse(
    port,
    `@PR:GET:${document}\n`,
    prefix,
    configurationTimeout(port, CONFIGURATION_DOCUMENTS[document].maxPayload),
    onTraffic,
    rejectionCode
  )
  try {
    const configuration = parseDeviceConfigurationJson(line.slice(prefix.length))
    if (configuration.board !== expectedBoard) {
      throw new Error('The device configuration board does not match the connected hardware.')
    }
    return configuration
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown configuration error.'
    throw new DeviceServiceError(rejectionCode, message)
  }
}

export async function readConfiguration(
  port: SerialPort,
  expectedBoard: PitrigBoardId,
  onTraffic: TrafficCallback,
  rejectionCode: DeviceErrorCode = 'configuration_rejected'
): Promise<DeviceConfiguration> {
  const documents = {} as Record<ConfigurationDocumentId, DeviceConfiguration>
  for (const document of CONFIGURATION_DOCUMENT_IDS) {
    documents[document] = await readConfigurationDocument(
      port,
      document,
      expectedBoard,
      onTraffic,
      rejectionCode
    )
  }
  return mergeDocuments(documents)
}

export async function applyConfiguration(
  port: SerialPort,
  document: ConfigurationDocumentId,
  payload: string,
  onTraffic: TrafficCallback
): Promise<void> {
  await requestResponse(
    port,
    `@PR:APPLY:${document}:${payload}\n`,
    `@PR:OK:APPLIED:${document}`,
    configurationTimeout(port, Buffer.byteLength(payload, 'utf8')),
    onTraffic,
    'configuration_rejected'
  )
}

export async function saveConfiguration(
  port: SerialPort,
  document: ConfigurationDocumentId,
  payload: string,
  onTraffic: TrafficCallback
): Promise<void> {
  await requestResponse(
    port,
    `@PR:SET:${document}:${payload}\n`,
    `@PR:OK:SAVED:${document}:`,
    configurationTimeout(port, Buffer.byteLength(payload, 'utf8')),
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
    '@PR:RESET\n',
    '@PR:OK:RESET:reboot_required=1',
    RESET_TIMEOUT_MS,
    onTraffic,
    'configuration_rejected'
  )
}

export async function resetConfigurationDocument(
  port: SerialPort,
  document: ConfigurationDocumentId,
  onTraffic: TrafficCallback
): Promise<void> {
  await requestResponse(
    port,
    `@PR:RESET:${document}\n`,
    `@PR:OK:RESET:${document}:`,
    RESET_TIMEOUT_MS,
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
    '@PR:IMAGE:CLEAR\n',
    '@PR:OK:IMAGE:CLEARED:reboot_required=1',
    ASSET_CLEAR_TIMEOUT_MS,
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
    '@PR:FONT:CLEAR\n',
    '@PR:OK:FONT:CLEARED:reboot_required=1',
    ASSET_CLEAR_TIMEOUT_MS,
    onTraffic,
    'serial_error'
  )
}
