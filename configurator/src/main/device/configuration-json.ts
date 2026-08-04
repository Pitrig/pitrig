import {
  CONFIGURATION_SCHEMA_VERSION,
  MAXIMUM_CONFIGURATION_PAYLOAD_SIZE,
  type DeviceConfiguration,
  type SimCoreBoardId
} from '../../shared/device'

const SUPPORTED_BOARDS = new Set<SimCoreBoardId>([
  't_display_s3',
  'guition_esp32_4848s040'
])

export function parseDeviceConfigurationJson(json: string): DeviceConfiguration {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('The device returned malformed configuration JSON.')
  }
  if (!isRecord(value) || !SUPPORTED_BOARDS.has(value.board as SimCoreBoardId)) {
    throw new Error('The device configuration does not contain a supported board.')
  }
  if (
    (value.hardware !== undefined &&
      (!Array.isArray(value.hardware) || value.hardware.length !== 0)) ||
    !optionalRecord(value.telemetry_transport) ||
    !optionalRecord(value.lap_timer) ||
    !optionalRecord(value.delta_time) ||
    !optionalDashboard(value.dashboard)
  ) {
    throw new Error(
      `The device returned an invalid schema ${CONFIGURATION_SCHEMA_VERSION} configuration.`
    )
  }
  return value as unknown as DeviceConfiguration
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

function optionalDashboard(value: unknown): boolean {
  if (value === undefined) return true
  if (!isRecord(value)) return false
  if (value.widgets === undefined) return true
  if (!isRecord(value.widgets)) return false
  return (
    optionalRecord(value.widgets.lap_timer) &&
    optionalRecord(value.widgets.delta_time) &&
    (value.widgets.text === undefined ||
      (Array.isArray(value.widgets.text) && value.widgets.text.every(isRecord)))
  )
}

function optionalRecord(value: unknown): boolean {
  return value === undefined || isRecord(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
