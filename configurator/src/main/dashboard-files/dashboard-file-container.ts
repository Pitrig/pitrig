import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { brotliCompress, brotliDecompress, constants, inflateRaw } from 'node:zlib'

import {
  DASHBOARD_FILE_CONTAINER_VERSION,
  DASHBOARD_FILE_MAGIC,
  MAXIMUM_DASHBOARD_FILE_SIZE
} from '../../shared/dashboard-files'
import { t } from '@shared/ui-text'

const PREFIX_SIZE = 16
const MAXIMUM_HEADER_SIZE = 1024 * 1024
const MAXIMUM_BLOBS = 64
const CODECS = ['br', 'deflate', 'none'] as const

type Codec = (typeof CODECS)[number]

const brotliCompressAsync = promisify(brotliCompress)
const brotliDecompressAsync = promisify(brotliDecompress)
const inflateRawAsync = promisify(inflateRaw)

export interface BlobRecord {
  offset: number
  length: number
  codec: Codec
  size: number
  sha256: string
}

export class DashboardFileFormatError extends Error {
  constructor(
    readonly code: 'invalid_file' | 'newer_file',
    message: string
  ) {
    super(message)
  }
}

export function damaged(): DashboardFileFormatError {
  return new DashboardFileFormatError('invalid_file', t('share.file.damaged'))
}

export function newer(version?: string): DashboardFileFormatError {
  return new DashboardFileFormatError(
    'newer_file',
    version ? t('share.file.newerVersion', { version }) : t('share.file.newer')
  )
}

export function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function packContainer(
  header: Record<string, unknown>,
  payloads: readonly Uint8Array[]
): Promise<Buffer> {
  const blobs: BlobRecord[] = []
  const compressed: Buffer[] = []
  let offset = 0
  for (const payload of payloads) {
    const bytes = await brotliCompressAsync(payload, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
        [constants.BROTLI_PARAM_LGWIN]: 24,
        [constants.BROTLI_PARAM_SIZE_HINT]: payload.byteLength
      }
    })
    blobs.push({
      offset,
      length: bytes.byteLength,
      codec: 'br',
      size: payload.byteLength,
      sha256: digest(payload)
    })
    compressed.push(bytes)
    offset += bytes.byteLength
  }
  const text = Buffer.from(JSON.stringify({ ...header, blobs }), 'utf8')
  const prefix = Buffer.alloc(PREFIX_SIZE)
  prefix.write(DASHBOARD_FILE_MAGIC, 0, 'ascii')
  prefix.writeUInt16LE(DASHBOARD_FILE_CONTAINER_VERSION, 8)
  prefix.writeUInt16LE(0, 10)
  prefix.writeUInt32LE(text.byteLength, 12)
  return Buffer.concat([prefix, text, ...compressed])
}

export function isContainer(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= PREFIX_SIZE &&
    Buffer.from(bytes.buffer, bytes.byteOffset, 8).toString('latin1') === DASHBOARD_FILE_MAGIC
  )
}

export interface OpenedContainer {
  header: Record<string, unknown>
  blob: (index: unknown, maximumSize: number) => Promise<Buffer>
}

export function openContainer(bytes: Buffer): OpenedContainer {
  if (bytes.byteLength > MAXIMUM_DASHBOARD_FILE_SIZE || !isContainer(bytes)) throw damaged()
  const version = bytes.readUInt16LE(8)
  if (version > DASHBOARD_FILE_CONTAINER_VERSION) throw newer()
  if (version < 1) throw damaged()
  const headerSize = bytes.readUInt32LE(12)
  if (headerSize > MAXIMUM_HEADER_SIZE || PREFIX_SIZE + headerSize > bytes.byteLength) {
    throw damaged()
  }
  let header: unknown
  try {
    header = JSON.parse(bytes.subarray(PREFIX_SIZE, PREFIX_SIZE + headerSize).toString('utf8'))
  } catch {
    throw damaged()
  }
  if (!isRecord(header)) throw damaged()
  const area = bytes.subarray(PREFIX_SIZE + headerSize)
  const records = parseBlobRecords(header.blobs, area.byteLength)
  return {
    header,
    blob: async (index, maximumSize) => {
      const record = Number.isSafeInteger(index) ? records[index as number] : undefined
      if (!record || record.size > maximumSize) throw damaged()
      return decodeBlob(area.subarray(record.offset, record.offset + record.length), record)
    }
  }
}

function parseBlobRecords(value: unknown, areaSize: number): BlobRecord[] {
  if (!Array.isArray(value) || value.length > MAXIMUM_BLOBS) throw damaged()
  return value.map((entry) => {
    if (!isRecord(entry)) throw damaged()
    const { offset, length, codec, size, sha256 } = entry
    if (typeof codec !== 'string') throw damaged()
    if (!CODECS.includes(codec as Codec)) throw newer()
    if (
      !isNatural(offset) ||
      !isNatural(length) ||
      !isNatural(size) ||
      (offset as number) + (length as number) > areaSize ||
      typeof sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(sha256)
    ) {
      throw damaged()
    }
    return {
      offset: offset as number,
      length: length as number,
      codec: codec as Codec,
      size: size as number,
      sha256
    }
  })
}

async function decodeBlob(stored: Buffer, record: BlobRecord): Promise<Buffer> {
  let bytes: Buffer
  try {
    bytes =
      record.codec === 'br'
        ? await brotliDecompressAsync(stored, { maxOutputLength: Math.max(1, record.size) })
        : record.codec === 'deflate'
          ? await inflateRawAsync(stored, { maxOutputLength: Math.max(1, record.size) })
          : Buffer.from(stored)
  } catch {
    throw damaged()
  }
  if (bytes.byteLength !== record.size || digest(bytes) !== record.sha256) throw damaged()
  return bytes
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNatural(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0
}
