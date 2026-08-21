import { migrateConfigurationDocument } from '../../shared/configuration-migrate'
import { validateConfigurationDocument } from '../../shared/configuration-validate'
import type { WidgetConfiguration } from '../../shared/configuration-schema'
import {
  MAXIMUM_CONFIGURATION_PAYLOAD_SIZE,
  SIMCORE_BOARD_IDS,
  type DeviceConfiguration,
  type SimCoreBoardId
} from '../../shared/device'

// Validation is the shared implementation driven by the generated schema, so
// the main process rejects exactly what the firmware rejects. It previously
// checked only a few node shapes and happily shipped payloads the device then
// answered with an error.

export function parseDeviceConfigurationJson(json: string): DeviceConfiguration {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('Configuration JSON is malformed.')
  }
  return parseDeviceConfigurationValue(value)
}

/**
 * The same parse for a document that has already been decoded — a template
 * carries its configuration as a member of its envelope rather than as text, so
 * it would otherwise have to be re-serialized just to be read back.
 */
export function parseDeviceConfigurationValue(value: unknown): DeviceConfiguration {
  // Documents authored against an older schema are brought forward before
  // validation, so opening a project saved by an earlier build just works.
  const result = validateConfigurationDocument(migrateConfigurationDocument(value), {
    supportedBoards: SIMCORE_BOARD_IDS
  })
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.configuration
}

/**
 * One widget, checked the way the device would check it.
 *
 * A fragment has no document around it, so it is given the smallest one that
 * can carry it and validated in there: that walks the discriminator and every
 * property against the generated allow-list, and brings a fragment saved under
 * an older schema forward on the way. The widget is read back out of the
 * validated document rather than returned as it arrived, so what the caller
 * gets is what the validator accepted.
 */
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
): { configuration: DeviceConfiguration; payload: string } {
  const configuration = parseDeviceConfigurationJson(json)
  if (configuration.board !== expectedBoard) {
    throw new Error(`Configuration board must remain ${expectedBoard}.`)
  }
  const payload = JSON.stringify(configuration)
  if (Buffer.byteLength(payload, 'utf8') > MAXIMUM_CONFIGURATION_PAYLOAD_SIZE) {
    throw new Error(
      `Configuration exceeds the ${MAXIMUM_CONFIGURATION_PAYLOAD_SIZE}-byte device limit.`
    )
  }
  return { configuration, payload }
}
