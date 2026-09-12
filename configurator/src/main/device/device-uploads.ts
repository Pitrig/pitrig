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
import { clearFontAssets, clearImageAssets } from './pitrig-protocol'
import { parseFontAssetInfo, parseImageAssetInfo } from './protocol-parsers'
import { requestResponse } from './serial-request'
import { t } from '@shared/ui-text'

const ASSET_INFO_TIMEOUT_MS = 1_000

const ASSET_INFO_REQUESTS = {
  FONT: { request: '@PR:FONT:INFO\n', prefix: '@PR:OK:FONT:INFO:' },
  IMAGE: { request: '@PR:IMAGE:INFO\n', prefix: '@PR:OK:IMAGE:INFO:' }
} as const

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
    throw new DeviceServiceError('serial_error', t('device.deviceOperation.noPitrigDeviceIsConnected'))
  }
  if (runner.operationActive) {
    throw new DeviceServiceError('busy', t('device.deviceOperation.anotherDeviceOperationIsAlready'))
  }
  const onTransmit = traffic?.enabled
    ? (data: string, encoding: 'utf8' | 'hex'): void => traffic.write('tx', data, encoding)
    : undefined
  const onTraffic = (direction: 'rx' | 'tx', data: string): void => {
    if (direction === 'tx') traffic?.write(direction, data)
  }
  await runner.withLock(async () => {
    try {
      await uploadAssetPackage(
        port,
        namespace,
        packageBytes,
        { onProgress, ...(onTransmit ? { onTransmit } : {}) },
        signal
      )
    } catch (error) {
      await resyncAssetPackage(connection, port, session, namespace.command, onTraffic)
      throw error
    }
    if (connection.getState().session !== session) return
    const next = advance(session, packageBytes)
    if (next) connection.setState({ ...connection.getState(), session: next })
  })
}

async function resyncAssetPackage(
  connection: ConnectionManager,
  port: SerialPort,
  session: DeviceSession,
  command: 'FONT' | 'IMAGE' | 'FW',
  onTraffic: (direction: 'rx' | 'tx', data: string) => void
): Promise<void> {
  if (command === 'FW' || connection.getState().session !== session) return
  const next = await readAssetPackage(port, session, command, onTraffic)
  if (next && connection.getState().session === session) {
    connection.setState({ ...connection.getState(), session: next })
  }
}

async function readAssetPackage(
  port: SerialPort,
  session: DeviceSession,
  command: 'FONT' | 'IMAGE',
  onTraffic: (direction: 'rx' | 'tx', data: string) => void
): Promise<DeviceSession | undefined> {
  const probe = ASSET_INFO_REQUESTS[command]
  if (port.isOpen) {
    try {
      const line = await requestResponse(
        port,
        probe.request,
        probe.prefix,
        ASSET_INFO_TIMEOUT_MS,
        onTraffic,
        'serial_error'
      )
      return command === 'FONT'
        ? { ...session, fontAssets: parseFontAssetInfo(line) }
        : { ...session, imageAssets: parseImageAssetInfo(line) }
    } catch {}
  }
  return command === 'FONT'
    ? withoutFontPackage(session, session.fontAssets?.rebootRequired ?? false)
    : withoutImagePackage(session, session.imageAssets?.rebootRequired ?? false)
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

function withoutFontPackage(
  session: DeviceSession,
  rebootRequired: boolean
): DeviceSession | undefined {
  const fontAssets = session.fontAssets
  if (!fontAssets) return undefined
  return {
    ...session,
    fontAssets: {
      ...fontAssets,
      packageAvailable: false,
      formatVersion: 0,
      familyCount: 0,
      families: [],
      packageSize: 0,
      payloadCrc: undefined,
      rebootRequired
    }
  }
}

function withoutImagePackage(
  session: DeviceSession,
  rebootRequired: boolean
): DeviceSession | undefined {
  const imageAssets = session.imageAssets
  if (!imageAssets) return undefined
  return {
    ...session,
    imageAssets: {
      ...imageAssets,
      packageAvailable: false,
      formatVersion: 0,
      images: [],
      packageSize: 0,
      rebootRequired
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
    t('device.deviceUploads.theConnectedFirmwareDoesNot'),
    t('device.deviceUploads.theConnectedDeviceChangedDuring'),
    clearImageAssets,
    (session) => withoutImagePackage(session, true)
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
    t('device.deviceUploads.theConnectedFirmwareDoesNot2'),
    t('device.deviceUploads.theConnectedDeviceChangedDuring2'),
    clearFontAssets,
    (session) => withoutFontPackage(session, true)
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
  advance: (session: DeviceSession) => DeviceSession | undefined
): Promise<DeviceResult<DeviceState>> {
  return runner.run(async ({ port, session, traffic }) => {
    if (!supported(session)) {
      return failure({ code: 'not_pitrig', message: unsupportedMessage })
    }
    await clear(port, runner.operationTraffic(traffic))
    if (connection.port !== port || connection.getState().session !== session) {
      throw new DeviceServiceError('serial_error', changedMessage)
    }
    const next = advance(session)
    if (next) connection.setState({ ...connection.getState(), session: next })
    return success(connection.getState())
  })
}
