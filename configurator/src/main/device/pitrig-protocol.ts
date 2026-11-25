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
import { t } from '@shared/ui-text'
import { DeviceServiceError } from './device-errors'
import {
  CONFIGURATION_RESPONSE_PREFIX,
  requestResponse,
  type TrafficCallback
} from './serial-request'
import { CONTROL_PREFIX } from '@shared/control-protocol'

export { requestResponse, sendControlCommand } from './serial-request'

const CONFIGURATION_TIMEOUT_MS = 2_000
const COMPOSITION_HOLD_MS = 10_000
const ASSET_CLEAR_TIMEOUT_MS = 30_000

function configurationTimeout(port: SerialPort, payloadBytes: number): number {
  const baud = Math.max(port.baudRate, 9_600)
  const transferMs = Math.ceil((payloadBytes * 10 * 1_000) / baud)
  return CONFIGURATION_TIMEOUT_MS + 2 * transferMs
}

function writeTimeout(port: SerialPort, payloadBytes: number): number {
  return configurationTimeout(port, payloadBytes) + COMPOSITION_HOLD_MS
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
    `${CONTROL_PREFIX}GET:${document}\n`,
    prefix,
    configurationTimeout(port, CONFIGURATION_DOCUMENTS[document].maxPayload),
    onTraffic,
    rejectionCode
  )
  let configuration: DeviceConfiguration
  try {
    configuration = parseDeviceConfigurationJson(line.slice(prefix.length))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown configuration error.'
    throw new DeviceServiceError('damaged_reply', message)
  }
  if (configuration.board !== expectedBoard) {
    throw new DeviceServiceError(
      rejectionCode,
      t('device.pitrigProtocol.theDeviceConfigurationBoardDoes')
    )
  }
  return configuration
}

export async function readConfiguration(
  port: SerialPort,
  expectedBoard: PitrigBoardId,
  onTraffic: TrafficCallback,
  rejectionCode: DeviceErrorCode = 'configuration_rejected',
  yielding: () => boolean = () => false
): Promise<DeviceConfiguration> {
  const documents = {} as Record<ConfigurationDocumentId, DeviceConfiguration>
  for (const document of CONFIGURATION_DOCUMENT_IDS) {
    if (yielding()) {
      throw new DeviceServiceError('cancelled', t('device.lineExchange.theRequestWasCancelled'))
    }
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
    `${CONTROL_PREFIX}APPLY:${document}:${payload}\n`,
    `${CONTROL_PREFIX}OK:APPLIED:${document}`,
    writeTimeout(port, Buffer.byteLength(payload, 'utf8')),
    onTraffic,
    'configuration_rejected'
  )
}

export async function validateConfiguration(
  port: SerialPort,
  document: ConfigurationDocumentId,
  payload: string,
  onTraffic: TrafficCallback
): Promise<void> {
  await requestResponse(
    port,
    `${CONTROL_PREFIX}VALIDATE:${document}:${payload}\n`,
    `${CONTROL_PREFIX}OK:VALID:${document}`,
    writeTimeout(port, Buffer.byteLength(payload, 'utf8')),
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
    `${CONTROL_PREFIX}SET:${document}:${payload}\n`,
    `${CONTROL_PREFIX}OK:SAVED:${document}:`,
    writeTimeout(port, Buffer.byteLength(payload, 'utf8')),
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
    `${CONTROL_PREFIX}RESET\n`,
    `${CONTROL_PREFIX}OK:RESET:reboot_required=1`,
    writeTimeout(port, 0),
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
    `${CONTROL_PREFIX}RESET:${document}\n`,
    `${CONTROL_PREFIX}OK:RESET:${document}:`,
    writeTimeout(port, 0),
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
    `${CONTROL_PREFIX}IMAGE:CLEAR\n`,
    `${CONTROL_PREFIX}OK:IMAGE:CLEARED:reboot_required=1`,
    ASSET_CLEAR_TIMEOUT_MS,
    onTraffic,
    'board_refused'
  )
}

export async function clearFontAssets(
  port: SerialPort,
  onTraffic: TrafficCallback
): Promise<void> {
  await requestResponse(
    port,
    `${CONTROL_PREFIX}FONT:CLEAR\n`,
    `${CONTROL_PREFIX}OK:FONT:CLEARED:reboot_required=1`,
    ASSET_CLEAR_TIMEOUT_MS,
    onTraffic,
    'board_refused'
  )
}
