import { crc32 } from '../device/asset-crc'
import { BOARD_ID_VALUES } from '../../shared/configuration-schema'
import type { SimCoreBoardId } from '../../shared/device'
import {
  FIRMWARE_FORMAT_VERSION,
  FIRMWARE_HEADER_SIZE,
  FIRMWARE_IMAGE_OFFSET,
  FIRMWARE_MANIFEST_ENTRY_SIZE,
  FIRMWARE_PACKAGE_MAGIC,
  MAXIMUM_FIRMWARE_IMAGE_SIZE
} from '../../shared/firmware-update'
import { t } from '@shared/ui-text'
import { PackageTooLargeError } from '../assets/asset-service-base'

export function buildFirmwarePackage(image: Buffer, board: SimCoreBoardId): Buffer {
  if (image.byteLength === 0) {
    throw new Error(t('firmware.firmwarePackage.theFirmwareImageIsEmpty'))
  }
  if (image.byteLength > MAXIMUM_FIRMWARE_IMAGE_SIZE) {
    throw new PackageTooLargeError(
      t('firmware.firmwarePackage.theFirmwareImageIsBytelength', { byteLength: image.byteLength })
    )
  }
  const boardIndex = BOARD_ID_VALUES.indexOf(board)
  if (boardIndex < 0) {
    throw new Error(t('firmware.firmwarePackage.unsupportedSimcoreBoardBoard', { board: board }))
  }

  const buffer = Buffer.alloc(FIRMWARE_IMAGE_OFFSET + image.byteLength)
  image.copy(buffer, FIRMWARE_IMAGE_OFFSET)
  buffer.writeUInt16LE(boardIndex, FIRMWARE_HEADER_SIZE)

  buffer.writeUInt32LE(FIRMWARE_PACKAGE_MAGIC, 0)
  buffer.writeUInt16LE(FIRMWARE_FORMAT_VERSION, 4)
  buffer.writeUInt16LE(FIRMWARE_HEADER_SIZE, 6)
  buffer.writeUInt32LE(0, 8)
  buffer.writeUInt16LE(1, 12)
  buffer.writeUInt16LE(0, 14)
  buffer.writeUInt32LE(buffer.byteLength, 16)
  buffer.writeUInt32LE(
    crc32(buffer.subarray(FIRMWARE_HEADER_SIZE, FIRMWARE_HEADER_SIZE + FIRMWARE_MANIFEST_ENTRY_SIZE)),
    20
  )
  buffer.writeUInt32LE(crc32(buffer.subarray(FIRMWARE_IMAGE_OFFSET)), 24)
  buffer.writeUInt32LE(crc32(buffer.subarray(0, 28)), 28)
  return buffer
}
