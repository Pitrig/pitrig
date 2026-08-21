import type { SerialPort } from 'serialport'

import {
  type DeviceConfiguration,
  type DeviceErrorCode,
  type SimCoreBoardId
} from '@shared/device'
import {
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

/**
 * One document read back, as the whole aggregate it is a slice of.
 *
 * The device answers `@SC:GET:<document>` with the exact bytes it loaded that
 * document from, so the reply is validated inside the smallest configuration
 * that can carry it — the same trick the editor's clipboard uses on a paste.
 */
export async function readConfigurationDocument(
  port: SerialPort,
  document: ConfigurationDocumentId,
  expectedBoard: SimCoreBoardId,
  onTraffic: TrafficCallback,
  rejectionCode: DeviceErrorCode = 'configuration_rejected'
): Promise<DeviceConfiguration> {
  const prefix = `${CONFIGURATION_RESPONSE_PREFIX}${document}:`
  const line = await requestResponse(
    port,
    `@SC:GET:${document}\n`,
    prefix,
    CONFIGURATION_TIMEOUT_MS,
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

/**
 * Every document, merged back into the one configuration the application edits.
 * Reading them in turn rather than in parallel is not a choice: the control
 * service answers one request at a time and drops a second arriving mid-answer.
 */
export async function readConfiguration(
  port: SerialPort,
  expectedBoard: SimCoreBoardId,
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
    `@SC:APPLY:${document}:${payload}\n`,
    `@SC:OK:APPLIED:${document}`,
    CONFIGURATION_TIMEOUT_MS,
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
    `@SC:SET:${document}:${payload}\n`,
    `@SC:OK:SAVED:${document}:`,
    CONFIGURATION_TIMEOUT_MS,
    onTraffic,
    'configuration_rejected'
  )
}

/** Erases every stored document, putting the board back on factory values. */
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

/** Erases one stored document, leaving the other two as they are. */
export async function resetConfigurationDocument(
  port: SerialPort,
  document: ConfigurationDocumentId,
  onTraffic: TrafficCallback
): Promise<void> {
  await requestResponse(
    port,
    `@SC:RESET:${document}\n`,
    `@SC:OK:RESET:${document}:`,
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
