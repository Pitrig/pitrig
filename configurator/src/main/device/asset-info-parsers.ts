import {
  FONT_FAMILY_PATTERN,
  MAXIMUM_FONT_FAMILIES,
  MAXIMUM_FONT_PACKAGE_SIZE
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
import type { FontAssetDeviceInfo } from '@shared/device'
import { DeviceServiceError } from './device-errors'
import { isBooleanField, parseAssetStatus, parseFields } from './protocol-parsers'

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

function parseInstalledImages(value: string | undefined): InstalledImage[] {
  if (!value) return []
  return value
    .split(';')
    .filter((entry) => entry.length > 0)
    .map((entry) => {
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
