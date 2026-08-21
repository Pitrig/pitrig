import type { SerialPort } from 'serialport'

import type { AssetUploadProgress } from '../../shared/asset-upload'
import type { DeviceResult, DeviceSession, DeviceState } from '../../shared/device'
import { readPackageFamilies } from '../font-assets/font-package'
import { uploadAssetPackage, type AssetNamespace } from './asset-upload'
import { DeviceServiceError, failure, success } from './device-errors'
import type { ConnectionManager } from './device-connection'
import type { OperationRunner } from './device-operation'
import { clearFontAssets, clearImageAssets } from './simcore-protocol'

// One package upload, whatever the kind, plus the session bookkeeping each
// kind performs afterwards. The device reports the installed set only after a
// restart, so each `advance` moves the session on from what was just sent
// rather than re-probing; returning undefined leaves it untouched.

export async function uploadPackage(
  connection: ConnectionManager,
  runner: OperationRunner,
  namespace: AssetNamespace & { command: 'FONT' | 'IMAGE' | 'FW' },
  packageBytes: Uint8Array,
  onProgress: (progress: AssetUploadProgress) => void,
  signal: AbortSignal,
  advance: (session: DeviceSession, packageBytes: Uint8Array) => DeviceSession | undefined
): Promise<void> {
  const port = connection.port
  const state = connection.getState()
  const session = state.session
  const traffic = connection.traffic
  if (!port?.isOpen || !state.connection || !session) {
    throw new DeviceServiceError('serial_error', 'No SimCore device is connected.')
  }
  if (runner.operationActive) {
    throw new DeviceServiceError('busy', 'Another device operation is already running.')
  }
  await runner.withLock(async () => {
    await uploadAssetPackage(
      port,
      namespace,
      packageBytes,
      {
        onProgress,
        onTransmit: (data: string, encoding: 'utf8' | 'hex') =>
          traffic?.write('tx', data, encoding)
      },
      signal
    )
    if (connection.getState().session !== session) return
    const next = advance(session, packageBytes)
    if (next) connection.setState({ ...connection.getState(), session: next })
  })
}

/**
 * What a finished font upload means for the session. The board reports what it
 * holds only after a restart, so this moves the session on from what was just
 * sent. `payloadCrc` is the package's payload CRC, so a second save this
 * session can skip an identical upload.
 */
export function advanceFontSession(
  session: DeviceSession,
  bytes: Uint8Array,
  payloadCrc?: number
): DeviceSession | undefined {
  if (!session.fontAssets) return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    ...session,
    fontAssets: {
      ...session.fontAssets,
      packageAvailable: true,
      formatVersion: view.getUint16(4, true),
      familyCount: view.getUint16(12, true),
      families: readPackageFamilies(bytes),
      packageSize: bytes.byteLength,
      payloadCrc: payloadCrc ?? view.getUint32(24, true),
      rebootRequired: true
    }
  }
}

export function advanceImageSession(
  session: DeviceSession,
  bytes: Uint8Array
): DeviceSession | undefined {
  return session.imageAssets
    ? {
        ...session,
        imageAssets: {
          ...session.imageAssets,
          packageAvailable: true,
          packageSize: bytes.byteLength,
          rebootRequired: true
        }
      }
    : undefined
}

export function advanceFirmwareSession(session: DeviceSession): DeviceSession | undefined {
  return session.firmware
    ? { ...session, firmware: { ...session.firmware, rebootRequired: true } }
    : undefined
}

/** What clearing an installed font package leaves the session holding. */
export function clearedFontSession(session: DeviceSession): DeviceSession {
  return {
    ...session,
    fontAssets: {
      ...session.fontAssets!,
      packageAvailable: false,
      formatVersion: 0,
      familyCount: 0,
      families: [],
      packageSize: 0,
      rebootRequired: true
    }
  }
}

/** What clearing an installed image package leaves the session holding. */
export function clearedImageSession(session: DeviceSession): DeviceSession {
  return {
    ...session,
    imageAssets: {
      ...session.imageAssets!,
      packageAvailable: false,
      formatVersion: 0,
      images: [],
      packageSize: 0,
      rebootRequired: true
    }
  }
}

export async function clearImagePackage(
  connection: ConnectionManager,
  runner: OperationRunner
): Promise<DeviceResult<DeviceState>> {
  return clearAssets(
    connection,
    runner,
    (session) => session.imageAssets !== undefined,
    'The connected firmware does not support image management.',
    'The connected device changed during image cleanup.',
    clearImageAssets,
    clearedImageSession
  )
}

export async function clearFontPackage(
  connection: ConnectionManager,
  runner: OperationRunner
): Promise<DeviceResult<DeviceState>> {
  return clearAssets(
    connection,
    runner,
    (session) => session.fontAssets !== undefined,
    'The connected firmware does not support font asset management.',
    'The connected device changed during font cleanup.',
    clearFontAssets,
    clearedFontSession
  )
}

/**
 * Clearing a font package and clearing an image package differ only in the
 * command sent and in which half of the session the reply invalidates, so the
 * guard, the mid-operation identity check and the bookkeeping live here once.
 */
async function clearAssets(
  connection: ConnectionManager,
  runner: OperationRunner,
  supported: (session: DeviceSession) => boolean,
  unsupportedMessage: string,
  changedMessage: string,
  clear: (
    port: SerialPort,
    onTraffic: (direction: 'rx' | 'tx', data: string) => void
  ) => Promise<void>,
  advance: (session: DeviceSession) => DeviceSession
): Promise<DeviceResult<DeviceState>> {
  return runner.run(async ({ port, session, traffic }) => {
    if (!supported(session)) {
      return failure({ code: 'not_simcore', message: unsupportedMessage })
    }
    await clear(port, runner.operationTraffic(traffic))
    if (connection.port !== port || connection.getState().session !== session) {
      throw new DeviceServiceError('serial_error', changedMessage)
    }
    connection.setState({ ...connection.getState(), session: advance(session) })
    return success(connection.getState())
  })
}
