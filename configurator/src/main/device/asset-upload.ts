import type { SerialPort } from 'serialport'

import type { AssetUploadProgress } from '../../shared/asset-upload'
import { describeDeviceError } from '../../shared/device-error-message'
import { crc32 } from './asset-crc'
import { exchangeLines } from './line-exchange'

const FRAME_MAGIC = Buffer.from('SCF1', 'ascii')
const FRAME_HEADER_SIZE = 14
const MAXIMUM_CHUNK_SIZE = 4096
const BEGIN_TIMEOUT_MS = 30_000
const FRAME_TIMEOUT_MS = 5_000
const RESPONSE_BUFFER_LIMIT = 8192
const DEVICE_ERROR_PREFIX = '@SC:ERR:'

class DeviceRejectedUploadError extends Error {}

export interface AssetNamespace {
  command: string
  label: string
}

interface UploadCallbacks {
  onProgress: (progress: AssetUploadProgress) => void
  onTransmit: (data: string, encoding: 'utf8' | 'hex') => void
}

export async function uploadAssetPackage(
  port: SerialPort,
  namespace: AssetNamespace,
  packageBytes: Uint8Array,
  callbacks: UploadCallbacks,
  signal: AbortSignal
): Promise<void> {
  let sessionStarted = false
  let beginMayBeActive = false
  let sequence = 0
  try {
    signal.throwIfAborted()
    callbacks.onProgress({
      stage: 'erasing',
      completed: 0,
      total: packageBytes.byteLength,
      message: `Preparing ${namespace.label} storage`
    })
    const begin = `@SC:${namespace.command}:BEGIN:size=${packageBytes.byteLength}\n`
    beginMayBeActive = true
    await exchangeLine(
      port,
      Buffer.from(begin, 'utf8'),
      `@SC:OK:${namespace.command}:READY:max_chunk=${MAXIMUM_CHUNK_SIZE}`,
      BEGIN_TIMEOUT_MS,
      callbacks,
      signal
    )
    beginMayBeActive = false
    sessionStarted = true

    let received = 0
    while (received < packageBytes.byteLength) {
      signal.throwIfAborted()
      const payload = packageBytes.subarray(
        received,
        Math.min(received + MAXIMUM_CHUNK_SIZE, packageBytes.byteLength)
      )
      const response = await exchangeLine(
        port,
        createFrame(1, sequence, payload),
        `@SC:OK:${namespace.command}:ACK:`,
        sequence === 0 ? BEGIN_TIMEOUT_MS : FRAME_TIMEOUT_MS,
        callbacks,
        signal
      )
      const ack = parseAck(namespace, response)
      const nextReceived = received + payload.byteLength
      if (ack.sequence !== sequence || ack.received !== nextReceived) {
        throw new Error(`The device returned an invalid ${namespace.label} upload acknowledgement.`)
      }
      received = nextReceived
      callbacks.onProgress({
        stage: 'uploading',
        completed: received,
        total: packageBytes.byteLength,
        message: `Uploaded ${received} of ${packageBytes.byteLength} bytes`
      })
      ++sequence
    }

    callbacks.onProgress({
      stage: 'committing',
      completed: packageBytes.byteLength,
      total: packageBytes.byteLength,
      message: `Validating and committing the ${namespace.label} package`
    })
    await exchangeLine(
      port,
      createFrame(2, sequence),
      `@SC:OK:${namespace.command}:COMMITTED:reboot_required=1`,
      FRAME_TIMEOUT_MS,
      callbacks,
      signal
    )
    sessionStarted = false
  } catch (error) {
    if (
      port.isOpen &&
      (sessionStarted || (beginMayBeActive && !(error instanceof DeviceRejectedUploadError)))
    ) {
      await cancelSession(port, namespace, sequence, callbacks)
    }
    throw error
  }
}

function createFrame(
  type: 1 | 2 | 3,
  sequence: number,
  payload: Uint8Array<ArrayBufferLike> = new Uint8Array()
): Buffer {
  const frame = Buffer.alloc(FRAME_HEADER_SIZE + payload.byteLength + 4)
  FRAME_MAGIC.copy(frame, 0)
  frame.writeUInt8(type, 4)
  frame.writeUInt8(0, 5)
  frame.writeUInt32LE(sequence, 6)
  frame.writeUInt16LE(payload.byteLength, 10)
  frame.writeUInt16LE(0, 12)
  Buffer.from(payload).copy(frame, FRAME_HEADER_SIZE)
  frame.writeUInt32LE(crc32(frame.subarray(0, -4)), frame.byteLength - 4)
  return frame
}

async function cancelSession(
  port: SerialPort,
  namespace: AssetNamespace,
  sequence: number,
  callbacks: UploadCallbacks
): Promise<void> {
  try {
    await exchangeLine(
      port,
      createFrame(3, sequence),
      `@SC:OK:${namespace.command}:CANCELLED`,
      FRAME_TIMEOUT_MS,
      callbacks,
      new AbortController().signal
    )
  } catch {
  }
}

function exchangeLine(
  port: SerialPort,
  request: Buffer,
  responsePrefix: string,
  timeoutMs: number,
  callbacks: UploadCallbacks,
  signal: AbortSignal
): Promise<string> {
  return exchangeLines<string>(port, {
    timeoutMs,
    bufferLimit: RESPONSE_BUFFER_LIMIT,
    signal,
    consume: (lines) => {
      const response = lines.find((line) => line.startsWith(responsePrefix))
      if (response) return { value: response }
      const deviceError = lines.find((line) => line.startsWith(DEVICE_ERROR_PREFIX))
      if (!deviceError) return undefined
      return {
        error: new DeviceRejectedUploadError(
          describeDeviceError(deviceError.slice(DEVICE_ERROR_PREFIX.length))
        )
      }
    },
    onTimeout: () => ({ error: new Error(`The device did not answer ${responsePrefix}.`) }),
    onClose: () => new Error('The serial port closed during the upload.'),
    onAbort: () => new Error('The upload was cancelled.'),
    send: (fail) => {
      port.write(request, (error) => {
        if (error) {
          fail(error)
          return
        }
        const utf8 = request[0] === 0x40
        callbacks.onTransmit(
          utf8 ? request.toString('utf8') : request.toString('hex'),
          utf8 ? 'utf8' : 'hex'
        )
        port.drain((drainError) => {
          if (drainError) fail(drainError)
        })
      })
    }
  })
}

function parseAck(
  namespace: AssetNamespace,
  line: string
): { sequence: number; received: number } {
  const match = new RegExp(
    `^@SC:OK:${namespace.command}:ACK:sequence=(\\d+),received=(\\d+)$`
  ).exec(line)
  if (!match) {
    throw new Error(`The device returned a malformed ${namespace.label} acknowledgement.`)
  }
  const sequence = Number(match[1])
  const received = Number(match[2])
  if (!Number.isSafeInteger(sequence) || !Number.isSafeInteger(received)) {
    throw new Error(`The device returned an invalid ${namespace.label} acknowledgement.`)
  }
  return { sequence, received }
}
