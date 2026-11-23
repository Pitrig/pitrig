import { basename } from 'node:path'
import { gunzipSync } from 'node:zlib'

import type { InstallChip } from '../../shared/first-install'
import { InstallFailure } from './install-failure'
import { CHIP_FACTS } from './rom/chip-facts'

const TAR_BLOCK = 512
const SECTOR = 0x1000
const MEGABYTE = 1024 * 1024
const IMAGE_MAGIC = 0xe9
const IMAGE_HEADER_SIZE = 24
const BUILT_APP_NAME = 'pitrig.bin'
const ARGUMENTS_NAME = 'flasher_args.json'

export interface FlashPart {
  name: string
  offset: number
  data: Buffer
}

export interface ReleaseArchive {
  chip: InstallChip
  flashSize: number
  parts: FlashPart[]
  revisions: { minimum: number; maximum: number }
}

interface FlasherArguments {
  flash_settings?: { flash_size?: unknown }
  flash_files?: Record<string, unknown>
  extra_esptool_args?: { chip?: unknown }
}

export function readReleaseArchive(archive: Buffer, release: string): ReleaseArchive {
  const files = readTar(archive)
  const flasher = flasherArguments(files.get(ARGUMENTS_NAME))
  const chip = installChip(flasher.extra_esptool_args?.chip)
  const flashSize = flashSizeOf(flasher.flash_settings?.flash_size)
  const parts = Object.entries(flasher.flash_files ?? {})
    .map(([address, path]) => partOf(files, release, address, path))
    .sort((left, right) => left.offset - right.offset)
  checkLayout(parts, flashSize)
  return { chip, flashSize, parts, revisions: imageRevisions(parts, chip) }
}

function readTar(archive: Buffer): Map<string, Buffer> {
  let bytes: Buffer
  try {
    bytes = gunzipSync(archive)
  } catch {
    throw incomplete(ARGUMENTS_NAME)
  }
  const files = new Map<string, Buffer>()
  for (let offset = 0; offset + TAR_BLOCK <= bytes.length; ) {
    const header = bytes.subarray(offset, offset + TAR_BLOCK)
    if (header.every((byte) => byte === 0)) break
    const name = textField(header, 0, 100)
    const ustar = header.subarray(257, 262).toString('latin1') === 'ustar'
    const prefix = ustar ? textField(header, 345, 155) : ''
    const size = Number.parseInt(textField(header, 124, 12).trim() || '0', 8)
    if (!Number.isFinite(size) || size < 0) break
    const type = header[156]
    const start = offset + TAR_BLOCK
    if (type === 0x30 || type === 0) {
      files.set(basename(prefix ? `${prefix}/${name}` : name), bytes.subarray(start, start + size))
    }
    offset = start + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK
  }
  return files
}

function textField(header: Buffer, start: number, length: number): string {
  const raw = header.subarray(start, start + length)
  const end = raw.indexOf(0)
  return raw.subarray(0, end === -1 ? length : end).toString('utf8')
}

function flasherArguments(file: Buffer | undefined): FlasherArguments {
  if (!file) throw incomplete(ARGUMENTS_NAME)
  try {
    const parsed: unknown = JSON.parse(file.toString('utf8'))
    if (parsed && typeof parsed === 'object') return parsed as FlasherArguments
  } catch {}
  throw incomplete(ARGUMENTS_NAME)
}

function installChip(value: unknown): InstallChip {
  if (value === 'esp32s3' || value === 'esp32p4') return value
  throw incomplete(ARGUMENTS_NAME)
}

function flashSizeOf(value: unknown): number {
  const match = typeof value === 'string' ? /^(\d+)MB$/i.exec(value) : null
  if (!match) throw incomplete(ARGUMENTS_NAME)
  return Number(match[1]) * MEGABYTE
}

function partOf(
  files: Map<string, Buffer>,
  release: string,
  address: string,
  path: unknown
): FlashPart {
  const stored = typeof path === 'string' ? basename(path) : ''
  const name = stored === BUILT_APP_NAME ? `pitrig-${release}.bin` : stored
  const offset = Number.parseInt(address, 16)
  const data = files.get(name)
  if (!name || !data || !Number.isInteger(offset) || offset < 0) throw incomplete(name || address)
  return { name, offset, data }
}

function checkLayout(parts: readonly FlashPart[], flashSize: number): void {
  let previousEnd = 0
  for (const part of parts) {
    const end = part.offset + part.data.length
    const misplaced = part.offset % SECTOR !== 0 || part.offset < previousEnd || end > flashSize
    if (misplaced || part.data.length === 0) throw incomplete(part.name)
    previousEnd = end
  }
  if (parts.length === 0) throw incomplete(ARGUMENTS_NAME)
}

function imageRevisions(
  parts: readonly FlashPart[],
  chip: InstallChip
): { minimum: number; maximum: number } {
  const images = parts.filter((part) => part.data[0] === IMAGE_MAGIC)
  if (images.length === 0) throw incomplete(ARGUMENTS_NAME)
  let minimum = 0
  let maximum = 0xffff
  for (const image of images) {
    if (image.data.length < IMAGE_HEADER_SIZE) throw incomplete(image.name)
    if (image.data.readUInt16LE(12) !== CHIP_FACTS[chip].chipId) throw incomplete(image.name)
    minimum = Math.max(minimum, image.data.readUInt16LE(15))
    maximum = Math.min(maximum, image.data.readUInt16LE(17))
  }
  return { minimum, maximum }
}

function incomplete(name: string): InstallFailure {
  return new InstallFailure('archive_incomplete', { name })
}
