import { MAXIMUM_CONFIGURATION_TEXT_SIZE } from '@shared/configuration-documents'
import type { DashboardShareRequest } from '@shared/dashboard-files'
import {
  IMAGE_COLOR_FORMATS,
  type ImageAssetInput
} from '@shared/image-assets'
import type { ImageLibraryAddRequest, ImageLibraryIdRequest } from '@shared/image-library'
import { MAXIMUM_TEMPLATE_DESCRIPTION, MAXIMUM_TEMPLATE_NAME } from '@shared/templates'

const MAXIMUM_ADDED_IMAGES = 256

export function isImageLibraryAddRequest(value: unknown): value is ImageLibraryAddRequest {
  if (typeof value !== 'object' || value === null) return false
  const assets = (value as ImageLibraryAddRequest).assets
  return (
    Array.isArray(assets) && assets.length <= MAXIMUM_ADDED_IMAGES && assets.every(isImageAssetInput)
  )
}

export function isImageLibraryIdRequest(value: unknown): value is ImageLibraryIdRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ImageLibraryIdRequest).id === 'string'
  )
}

export function isDashboardShareRequest(value: unknown): value is DashboardShareRequest {
  if (typeof value !== 'object' || value === null) return false
  const request = value as Partial<DashboardShareRequest>
  return (
    typeof request.json === 'string' &&
    request.json.length <= MAXIMUM_CONFIGURATION_TEXT_SIZE &&
    typeof request.name === 'string' &&
    request.name.length <= MAXIMUM_TEMPLATE_NAME &&
    (request.description === undefined ||
      (typeof request.description === 'string' &&
        request.description.length <= MAXIMUM_TEMPLATE_DESCRIPTION))
  )
}

function isImageAssetInput(asset: unknown): asset is ImageAssetInput {
  if (typeof asset !== 'object' || asset === null) return false
  const input = asset as ImageAssetInput
  return (
    Array.isArray(input.sourceIds) &&
    input.sourceIds.every((sourceId) => typeof sourceId === 'string') &&
    typeof input.name === 'string' &&
    typeof input.width === 'number' &&
    typeof input.height === 'number' &&
    IMAGE_COLOR_FORMATS.includes(input.format)
  )
}
