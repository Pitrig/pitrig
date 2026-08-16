import { migrateConfigurationDocument } from '../../shared/configuration-migrate'
import { validateConfigurationDocument } from '../../shared/configuration-validate'
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
