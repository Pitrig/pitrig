import { migrateConfigurationDocument } from '../../shared/configuration-migrate'
import { validateConfigurationDocument } from '../../shared/configuration-validate'
import {
  CONFIGURATION_DOCUMENTS,
  CONFIGURATION_DOCUMENT_IDS,
  type ConfigurationDocumentId,
  type WidgetConfiguration
} from '../../shared/configuration-schema'
import {
  CONFIGURATION_DOCUMENT_LABELS,
  documentJson
} from '../../shared/configuration-documents'
import {
  SIMCORE_BOARD_IDS,
  type DeviceConfiguration,
  type SimCoreBoardId
} from '../../shared/device'

export function parseDeviceConfigurationJson(json: string): DeviceConfiguration {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('Configuration JSON is malformed.')
  }
  return parseDeviceConfigurationValue(value)
}

export function parseDeviceConfigurationValue(value: unknown): DeviceConfiguration {
  const result = validateConfigurationDocument(migrateConfigurationDocument(value), {
    supportedBoards: SIMCORE_BOARD_IDS
  })
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.configuration
}

export function parseWidgetFragment(value: unknown, board: SimCoreBoardId): WidgetConfiguration {
  const document = parseDeviceConfigurationValue({
    board,
    dashboard: { screens: [{ widgets: [value] }] }
  })
  const widget = document.dashboard?.screens?.[0]?.widgets?.[0]
  if (!widget) throw new Error('The fragment holds no widget.')
  return widget
}

export function prepareDeviceConfigurationJson(
  json: string,
  expectedBoard: SimCoreBoardId
): {
  configuration: DeviceConfiguration
  payloads: Record<ConfigurationDocumentId, string>
} {
  const configuration = parseDeviceConfigurationJson(json)
  if (configuration.board !== expectedBoard) {
    throw new Error(`Configuration board must remain ${expectedBoard}.`)
  }
  const payloads = {} as Record<ConfigurationDocumentId, string>
  for (const document of CONFIGURATION_DOCUMENT_IDS) {
    const payload = documentJson(configuration, document)
    const limit = CONFIGURATION_DOCUMENTS[document].maxPayload
    if (Buffer.byteLength(payload, 'utf8') > limit) {
      throw new Error(
        `The ${CONFIGURATION_DOCUMENT_LABELS[document].toLowerCase()} configuration exceeds ` +
          `the ${limit}-byte device limit.`
      )
    }
    payloads[document] = payload
  }
  return { configuration, payloads }
}
