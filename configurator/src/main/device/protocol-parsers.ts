import {
  MAXIMUM_FONT_FAMILIES,
  MAXIMUM_FONT_PACKAGE_SIZE,
  FONT_FAMILY_PATTERN
} from '@shared/font-assets'
import {
  IMAGE_ID_PATTERN,
  IMAGE_PACKAGE_FORMAT_VERSION,
  MAXIMUM_IMAGES,
  MAXIMUM_IMAGE_PACKAGE_SIZE,
  MAXIMUM_SPRITE_FRAMES,
  MINIMUM_IMAGE_PACKAGE_FORMAT_VERSION,
  type ImageAssetState,
  type InstalledImage
} from '@shared/image-assets'
import { type FirmwareUpdateState } from '@shared/firmware-update'
import {
  BOARD_PROFILES,
  CONFIGURATION_SCHEMA_VERSION,
  SIMCORE_BOARD_IDS,
  type ConfigurationDocumentOutcome,
  type ConfigurationDocumentState,
  type DeviceInfo,
  type FontAssetDeviceInfo,
  type SimCoreBoardId
} from '@shared/device'
import {
  CONFIGURATION_DOCUMENT_IDS,
  type ConfigurationDocumentId
} from '@shared/configuration-schema'
import { DeviceServiceError } from './device-errors'

// Reading what the device says back. Every function here is a pure decode of
// one reply line: no serial port, no timeouts, no state.

function parseFields(line: string, prefix: string, fieldName: string): Map<string, string> {
  const fields = new Map<string, string>()
  for (const entry of line.slice(prefix.length).split(',')) {
    const separator = entry.indexOf('=')
    if (separator <= 0) {
      throw new DeviceServiceError(
        'not_simcore',
        `The device returned malformed ${fieldName}.`
      )
    }
    fields.set(entry.slice(0, separator), entry.slice(separator + 1))
  }
  return fields
}

function isBooleanField(value: string | undefined): boolean {
  return value === '0' || value === '1'
}

/**
 * What both asset kinds report the same way: a format version, a count, a
 * package size, and whether storage is present and a reboot is owed. The two
 * parsers were the same thirty-line validation wall with different nouns —
 * which is how the font side came to check its package bound as a literal
 * while the image side used the named constant.
 */
interface AssetStatusLimits {
  prefix: string
  label: string
  countField: string
  maximumCount: number
  /** The newest package version this application writes. */
  formatVersion: number
  /**
   * The oldest one it still understands, when a kind kept an older package
   * readable rather than obsoleting it. Defaults to the newest.
   */
  minimumFormatVersion?: number
  maximumPackageSize: number
}

interface AssetStatus {
  storageAvailable: boolean
  packageAvailable: boolean
  rebootRequired: boolean
  formatVersion: number
  count: number
  packageSize: number
  entries: string | undefined
  /** Raw, because only fonts report one; the kind decides what it means. */
  crc: string | undefined
}

function parseAssetStatus(line: string, limits: AssetStatusLimits): AssetStatus {
  const fields = parseFields(line, limits.prefix, limits.label)
  const formatVersion = Number(fields.get('format'))
  const count = Number(fields.get(limits.countField))
  const packageSize = Number(fields.get('size'))
  const packageAvailable = fields.get('package') === '1'
  if (
    !isBooleanField(fields.get('storage')) ||
    !isBooleanField(fields.get('package')) ||
    !isBooleanField(fields.get('reboot_required')) ||
    !Number.isSafeInteger(formatVersion) || formatVersion < 0 ||
    formatVersion > 0xffff ||
    !Number.isSafeInteger(count) || count < 0 || count > limits.maximumCount ||
    !Number.isSafeInteger(packageSize) || packageSize < 0 ||
    packageSize > limits.maximumPackageSize ||
    (packageAvailable
      ? formatVersion < (limits.minimumFormatVersion ?? limits.formatVersion) ||
        formatVersion > limits.formatVersion ||
        packageSize < 4096
      : formatVersion !== 0 || count !== 0 || packageSize !== 0)
  ) {
    throw new DeviceServiceError(
      'not_simcore',
      `The device returned malformed ${limits.label}.`
    )
  }
  return {
    storageAvailable: fields.get('storage') === '1',
    packageAvailable,
    rebootRequired: fields.get('reboot_required') === '1',
    formatVersion,
    count,
    packageSize,
    entries: fields.get('entries'),
    crc: fields.get('crc')
  }
}

export function parseDeviceInfo(line: string): DeviceInfo {
  const fields = parseFields(line, '@SC:OK:INFO:', 'INFO data')
  const board = fields.get('board') as SimCoreBoardId | undefined
  if (board === undefined || !SIMCORE_BOARD_IDS.includes(board)) {
    throw new DeviceServiceError('not_simcore', `Unsupported SimCore board: ${board ?? 'unknown'}.`)
  }
  if (fields.get('schema') !== String(CONFIGURATION_SCHEMA_VERSION)) {
    throw new DeviceServiceError(
      'not_simcore',
      `Unsupported configuration schema: ${fields.get('schema') ?? 'unknown'}.`
    )
  }
  const firmwareVersion = fields.get('firmware')
  if (!firmwareVersion || !isBooleanField(fields.get('storage'))) {
    throw new DeviceServiceError('not_simcore', 'The device returned malformed INFO data.')
  }
  // One field per document, spelled `<document>=<outcome>:<generation>`. Every
  // document this build knows has to be there: a firmware that reports fewer
  // has a different contract, and the schema check above is what should have
  // caught it.
  const documents = {} as Record<ConfigurationDocumentId, ConfigurationDocumentState>
  for (const document of CONFIGURATION_DOCUMENT_IDS) {
    documents[document] = parseDocumentState(fields.get(document))
  }
  return {
    boardId: board,
    firmwareVersion,
    schemaVersion: CONFIGURATION_SCHEMA_VERSION,
    display: BOARD_PROFILES[board].display,
    documents,
    storageAvailable: fields.get('storage') === '1'
  }
}

const DOCUMENT_OUTCOMES: readonly ConfigurationDocumentOutcome[] = [
  'absent',
  'malformed_record',
  'unsupported_schema',
  'corrupt_payload',
  'rejected',
  'valid'
]

function parseDocumentState(value: string | undefined): ConfigurationDocumentState {
  const separator = value?.indexOf(':') ?? -1
  const outcome = separator > 0 ? value!.slice(0, separator) : undefined
  const generation = separator > 0 ? Number(value!.slice(separator + 1)) : Number.NaN
  if (
    !DOCUMENT_OUTCOMES.includes(outcome as ConfigurationDocumentOutcome) ||
    !Number.isSafeInteger(generation) ||
    generation < 0
  ) {
    throw new DeviceServiceError('not_simcore', 'The device returned malformed INFO data.')
  }
  return { outcome: outcome as ConfigurationDocumentOutcome, generation }
}

/**
 * Firmware status reports two slots rather than a package: which one is running,
 * which one the next upload lands in, and whether either is waiting on a
 * restart. It shares no shape with the asset kinds, so it shares no parser.
 */
export function parseFirmwareUpdateInfo(line: string): FirmwareUpdateState {
  const fields = parseFields(line, '@SC:OK:FW:INFO:', 'firmware status')
  const running = fields.get('running')
  const target = fields.get('target')
  const version = fields.get('version')
  if (
    !isBooleanField(fields.get('storage')) ||
    !isBooleanField(fields.get('pending_verify')) ||
    !isBooleanField(fields.get('reboot_required')) ||
    running === undefined ||
    target === undefined ||
    version === undefined
  ) {
    throw new DeviceServiceError('not_simcore', 'The device returned malformed firmware status.')
  }
  return {
    storageAvailable: fields.get('storage') === '1',
    running,
    target,
    version,
    pendingVerify: fields.get('pending_verify') === '1',
    rebootRequired: fields.get('reboot_required') === '1'
  }
}

export function parseImageAssetInfo(line: string): ImageAssetState {
  const status = parseAssetStatus(line, {
    prefix: '@SC:OK:IMAGE:INFO:',
    label: 'image status',
    countField: 'images',
    maximumCount: MAXIMUM_IMAGES,
    formatVersion: IMAGE_PACKAGE_FORMAT_VERSION,
    minimumFormatVersion: MINIMUM_IMAGE_PACKAGE_FORMAT_VERSION,
    maximumPackageSize: MAXIMUM_IMAGE_PACKAGE_SIZE
  })
  const images = parseInstalledImages(status.entries)
  if (status.entries !== undefined && images.length !== status.count) {
    throw new DeviceServiceError('not_simcore', 'The device returned malformed image status.')
  }
  return {
    storageAvailable: status.storageAvailable,
    packageAvailable: status.packageAvailable,
    formatVersion: status.formatVersion,
    packageSize: status.packageSize,
    images,
    rebootRequired: status.rebootRequired
  }
}

/** `name:WxH:format`, separated by semicolons. */
function parseInstalledImages(value: string | undefined): InstalledImage[] {
  if (!value) return []
  return value
    .split(';')
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      // A sprite sheet appends its frame count; an ordinary image has one frame
      // and says nothing, so a three-field entry is the same as it ever was.
      const [name, size, format, frames] = entry.split(':')
      const [width, height] = (size ?? '').split('x')
      return {
        name: name ?? '',
        width: Number(width),
        height: Number(height),
        format: format ?? '',
        frameCount: frames === undefined ? 1 : Number(frames)
      }
    })
    .filter(
      (image) =>
        IMAGE_ID_PATTERN.test(image.name) &&
        Number.isSafeInteger(image.width) &&
        Number.isSafeInteger(image.height) &&
        Number.isSafeInteger(image.frameCount) &&
        image.frameCount >= 1 &&
        image.frameCount <= MAXIMUM_SPRITE_FRAMES
    )
}

export function parseFontAssetInfo(line: string): FontAssetDeviceInfo {
  const status = parseAssetStatus(line, {
    prefix: '@SC:OK:FONT:INFO:',
    label: 'font status',
    countField: 'families',
    maximumCount: MAXIMUM_FONT_FAMILIES,
    formatVersion: 3,
    maximumPackageSize: MAXIMUM_FONT_PACKAGE_SIZE
  })
  const families = parseFontFamilies(status.entries)
  if (status.entries !== undefined && families.length !== status.count) {
    throw new DeviceServiceError('not_simcore', 'The device returned malformed font status.')
  }
  const payloadCrc = parsePayloadCrc(status.crc)
  return {
    storageAvailable: status.storageAvailable,
    packageAvailable: status.packageAvailable,
    formatVersion: status.formatVersion,
    familyCount: status.count,
    families,
    packageSize: status.packageSize,
    ...(payloadCrc === undefined ? {} : { payloadCrc }),
    rebootRequired: status.rebootRequired
  }
}

/**
 * The stored package's payload CRC. Firmware that predates the key leaves it
 * absent, which reads as "cannot tell" and therefore as "upload anyway" — so an
 * older board still works, it just never skips a font upload.
 */
function parsePayloadCrc(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const crc = Number(value)
  if (!Number.isSafeInteger(crc) || crc < 0 || crc > 0xffff_ffff) {
    throw new DeviceServiceError('not_simcore', 'The device returned malformed font status.')
  }
  return crc
}

function parseFontFamilies(value: string | undefined): string[] {
  if (value === undefined || value === '') return []
  const families: string[] = []
  for (const family of value.split(';')) {
    if (!FONT_FAMILY_PATTERN.test(family) || families.includes(family)) {
      throw new DeviceServiceError('not_simcore', 'The device returned malformed font entries.')
    }
    families.push(family)
  }
  return families
}
