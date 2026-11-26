import { migrateConfigurationDocument } from '../../shared/configuration-migrate'
import { t } from '@shared/ui-text'
import {
  onlyUnknownNames,
  validateConfigurationDocument
} from '../../shared/configuration-validate'
import {
  CONFIGURATION_DOCUMENTS,
  CONFIGURATION_DOCUMENT_IDS,
  type ConfigurationDocumentId,
  type WidgetConfiguration
} from '../../shared/configuration-schema'
import {
  documentJson
} from '../../shared/configuration-documents'
import {
  PITRIG_BOARD_IDS,
  type DeviceConfiguration,
  type PitrigBoardId
} from '../../shared/device'

export class NewerConfigurationError extends Error {
  constructor(
    message: string,
    readonly board: PitrigBoardId
  ) {
    super(message)
  }
}

export function parseDeviceConfigurationJson(json: string): DeviceConfiguration {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error(t('device.configurationJson.configurationJsonIsMalformed'))
  }
  return parseDeviceConfigurationValue(value)
}

export function parseDeviceConfigurationValue(value: unknown): DeviceConfiguration {
  const migrated = migrateConfigurationDocument(value)
  const options = { supportedBoards: PITRIG_BOARD_IDS }
  const result = validateConfigurationDocument(migrated, options)
  if (result.ok) return result.configuration
  if (onlyUnknownNames(migrated, options)) {
    throw new NewerConfigurationError(result.error, (migrated as DeviceConfiguration).board)
  }
  throw new Error(result.error)
}

export function parseWidgetFragment(value: unknown, board: PitrigBoardId): WidgetConfiguration {
  return carriedWidget(widgetCarrier(value, board))
}

export function widgetCarrier(value: unknown, board: PitrigBoardId): DeviceConfiguration {
  return parseDeviceConfigurationValue({
    board,
    dashboard: { screens: [{ widgets: [value] }] }
  })
}

export function carriedWidget(document: DeviceConfiguration): WidgetConfiguration {
  const widget = document.dashboard?.screens?.[0]?.widgets?.[0]
  if (!widget) throw new Error(t('device.configurationJson.theFragmentHoldsNoWidget'))
  return widget
}

export function prepareDeviceConfigurationJson(
  json: string,
  expectedBoard: PitrigBoardId
): {
  configuration: DeviceConfiguration
  payloads: Record<ConfigurationDocumentId, string>
} {
  const configuration = parseDeviceConfigurationJson(json)
  if (configuration.board !== expectedBoard) {
    throw new Error(t('device.configurationJson.configurationBoardMustRemainBoard', { board: expectedBoard }))
  }
  const payloads = {} as Record<ConfigurationDocumentId, string>
  for (const document of CONFIGURATION_DOCUMENT_IDS) {
    const payload = documentJson(configuration, document)
    const limit = CONFIGURATION_DOCUMENTS[document].maxPayload
    if (Buffer.byteLength(payload, 'utf8') > limit) {
      throw new Error(
        `The ${t(`documents.labelLower.${document}`)} configuration exceeds ` +
          `the ${limit}-byte device limit.`
      )
    }
    payloads[document] = payload
  }
  return { configuration, payloads }
}
