import {
  TELEMETRY_TRANSPORT_ID_VALUES,
  type ApplicationConfiguration
} from '../configuration-schema'
import { BOARD_PROFILES, type PitrigBoardId } from '../device'
import { t } from '../ui-text'

const MINIMUM_BAUD_RATE = 9_600
const MAXIMUM_BAUD_RATE = 2_000_000

export function findTransportError(
  configuration: ApplicationConfiguration
): string | undefined {
  const transport = configuration.telemetry_transport
  if (transport === undefined) return undefined
  const id = transport.id
  if (id !== undefined && !TELEMETRY_TRANSPORT_ID_VALUES.includes(id)) {
    return t('validation.transport.telemetryTransportIdIsId', { id: JSON.stringify(id), join: TELEMETRY_TRANSPORT_ID_VALUES.join(', ') })
  }
  const board = configuration.board as PitrigBoardId | undefined
  const profile = board ? BOARD_PROFILES[board] : undefined
  if (id === 'native_usb_cdc' && profile && !profile.transports.nativeUsbCdc) {
    return t('validation.transport.thisBoardHasNoNative')
  }
  if (id === 'uart') {
    if (profile && !profile.transports.uart) {
      return t('validation.transport.thisBoardHasNoUart')
    }
    const baudRate = transport.uart?.baud_rate
    if (
      baudRate !== undefined &&
      (!Number.isFinite(baudRate) ||
        baudRate < MINIMUM_BAUD_RATE ||
        baudRate > MAXIMUM_BAUD_RATE)
    ) {
      return t('validation.transport.theUartRunsAtBaudrate', { baudRate: baudRate, mINIMUM_BAUD_RATE: MINIMUM_BAUD_RATE, mAXIMUM_BAUD_RATE: MAXIMUM_BAUD_RATE })
    }
  }
  return undefined
}
