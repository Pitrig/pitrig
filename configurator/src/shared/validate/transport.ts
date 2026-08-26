import {
  TELEMETRY_TRANSPORT_ID_VALUES,
  type ApplicationConfiguration
} from '../configuration-schema'
import { BOARD_PROFILES, type SimCoreBoardId } from '../device'

const MINIMUM_BAUD_RATE = 9_600
const MAXIMUM_BAUD_RATE = 2_000_000

export function findTransportError(
  configuration: ApplicationConfiguration
): string | undefined {
  const transport = configuration.telemetry_transport
  if (transport === undefined) return undefined
  const id = transport.id
  if (id !== undefined && !TELEMETRY_TRANSPORT_ID_VALUES.includes(id)) {
    return `"telemetry_transport.id" is ${JSON.stringify(id)}; the device knows ${TELEMETRY_TRANSPORT_ID_VALUES.join(', ')}.`
  }
  const board = configuration.board as SimCoreBoardId | undefined
  const profile = board ? BOARD_PROFILES[board] : undefined
  if (id === 'native_usb_cdc' && profile && !profile.transports.nativeUsbCdc) {
    return 'This board has no native USB port; telemetry has to run over its UART.'
  }
  if (id === 'uart') {
    if (profile && !profile.transports.uart) {
      return 'This board has no UART for telemetry; it talks over its native USB port.'
    }
    const baudRate = transport.uart?.baud_rate
    if (
      baudRate !== undefined &&
      (!Number.isFinite(baudRate) ||
        baudRate < MINIMUM_BAUD_RATE ||
        baudRate > MAXIMUM_BAUD_RATE)
    ) {
      return `The UART runs at ${baudRate} bits per second; the device accepts ${MINIMUM_BAUD_RATE} to ${MAXIMUM_BAUD_RATE}.`
    }
  }
  return undefined
}
