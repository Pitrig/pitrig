import type { SerialPort } from 'serialport'

import {
  type DeviceConfiguration,
  type DeviceErrorCode,
  type SimCoreBoardId
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
// Resetting erases NVS records, which is quick but still flash work.
const RESET_TIMEOUT_MS = 5_000
// The device erases the whole 2–4 MiB asset partition before it answers CLEAR,
// exactly the work the upload engine budgets BEGIN_TIMEOUT_MS for. A 2 s wait
// here reported boards as unreachable while they were busy erasing.
const ASSET_CLEAR_TIMEOUT_MS = 30_000

/**
 * How long a configuration exchange may take on this link.
 *
 * A dashboard document is up to 64 KiB, and both the SET line and the GET
 * reply carry it whole — at 460800 baud that alone is ~1.4 s on the wire, and
 * the slower rates the UI legitimately offers take far longer. A flat 2 s
 * timeout therefore failed the very probe that reads the configuration on
 * connect, which read as "not a SimCore device" with no way back in.
 *
 * `port.baudRate` is the rate the port was opened at: on a USB-serial bridge
 * it is what the bytes actually travel at, and on native USB it is nominal
 * while the link is faster, so the reply only ever arrives early. The factor
 * of two covers the device's own work — parsing and validating 64 KiB of
 * JSON, and for SET the NVS write plus its read-back verification.
 */
function configurationTimeout(port: SerialPort, payloadBytes: number): number {
  const baud = Math.max(port.baudRate, 9_600)
  const transferMs = Math.ceil((payloadBytes * 10 * 1_000) / baud)
  return CONFIGURATION_TIMEOUT_MS + 2 * transferMs
}

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
    `@SC:SET:${document}:${payload}\n`,
    `@SC:OK:SAVED:${document}:`,
    configurationTimeout(port, Buffer.byteLength(payload, 'utf8')),
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
    RESET_TIMEOUT_MS,
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
    '@SC:IMAGE:CLEAR\n',
    '@SC:OK:IMAGE:CLEARED:reboot_required=1',
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
    '@SC:FONT:CLEAR\n',
    '@SC:OK:FONT:CLEARED:reboot_required=1',
    ASSET_CLEAR_TIMEOUT_MS,
    onTraffic,
    'serial_error'
  )
}
