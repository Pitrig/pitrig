import type { SerialPort } from 'serialport'

import type { AssetUploadProgress } from '../../shared/asset-upload'
import type { DeviceResult, DeviceSession, DeviceState } from '../../shared/device'
import {
  IMAGE_PACKAGE_FORMAT_VERSION,
  type InstalledImage
} from '../../shared/image-assets'
import { readPackageFamilies } from '../font-assets/font-package'
import { uploadAssetPackage, type AssetNamespace } from './asset-upload'
import { DeviceServiceError, failure, success } from './device-errors'
import type { ConnectionManager } from './device-connection'
import type { OperationRunner } from './device-operation'
import { clearFontAssets, clearImageAssets } from './simcore-protocol'

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
  bytes: Uint8Array,
  installed: readonly InstalledImage[]
): DeviceSession | undefined {
  return session.imageAssets
    ? {
        ...session,
        imageAssets: {
          ...session.imageAssets,
          packageAvailable: true,
          formatVersion: IMAGE_PACKAGE_FORMAT_VERSION,
          images: [...installed],
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
