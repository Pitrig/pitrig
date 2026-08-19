import {
  IMAGE_COLOR_FORMATS,
  type ImageUploadRequest
} from '@shared/image-assets'
import {
  MAXIMUM_FONT_FAMILIES,
  type FontAssetInput,
  type FontUploadRequest
} from '@shared/font-assets'
import { type FirmwareUploadRequest } from '@shared/firmware-update'
import type { ConnectDeviceRequest, DeviceConfigurationRequest, DeviceResult } from '@shared/device'
import type { ConfigurationFileSaveRequest } from '@shared/configuration-files'
import type { SimHubProfileExportRequest } from '@shared/simhub-profile'
import {
  BUNDLED_TEMPLATE_PREFIX,
  MAXIMUM_TEMPLATE_DESCRIPTION,
  MAXIMUM_TEMPLATE_NAME,
  TEMPLATE_ID_PATTERN,
  type TemplateIdRequest,
  type TemplateSaveRequest
} from '@shared/templates'

// Everything arriving over IPC is untrusted: the renderer is separate code and
// a handler must not take its word for the shape of a request. These are the
// hand-rolled predicates that check it, kept together so a new channel's guard
// is written beside the others rather than inline among the registrations.

export function isImageUploadRequest(value: unknown): value is ImageUploadRequest {
  if (typeof value !== 'object' || value === null) return false
  const assets = (value as ImageUploadRequest).assets
  return (
    Array.isArray(assets) &&
    assets.every(
      (asset) =>
        typeof asset === 'object' &&
        asset !== null &&
        typeof asset.sourceId === 'string' &&
        typeof asset.name === 'string' &&
        typeof asset.width === 'number' &&
        typeof asset.height === 'number' &&
        IMAGE_COLOR_FORMATS.includes(asset.format)
    )
  )
}

export function isConnectRequest(value: unknown): value is ConnectDeviceRequest {
  if (!value || typeof value !== 'object') {
    return false
  }
  const request = value as Partial<ConnectDeviceRequest>
  return (
    typeof request.portId === 'string' &&
    request.portId.length > 0 &&
    request.portId.length <= 128 &&
    typeof request.baudRate === 'number' &&
    Number.isInteger(request.baudRate) &&
    request.baudRate >= 9_600 &&
    request.baudRate <= 2_000_000
  )
}

// Both the device and the file request are `{ json: string }`; the bound is the
// source-document limit, not the payload limit, which the parser enforces.
export function isJsonDocumentRequest(
  value: unknown
): value is DeviceConfigurationRequest & ConfigurationFileSaveRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<DeviceConfigurationRequest>
  return typeof request.json === 'string' && request.json.length <= 64 * 1024
}

/**
 * The envelope's own fields plus the document as text, bounded the same way a
 * configuration file request is. Shape only — the service parses and validates
 * the document itself.
 */
export function isTemplateSaveRequest(value: unknown): value is TemplateSaveRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<TemplateSaveRequest>
  if (typeof request.name !== 'string' || request.name.length > MAXIMUM_TEMPLATE_NAME) return false
  if (
    request.description !== undefined &&
    (typeof request.description !== 'string' ||
      request.description.length > MAXIMUM_TEMPLATE_DESCRIPTION)
  ) {
    return false
  }
  return typeof request.json === 'string' && request.json.length <= 64 * 1024
}

/**
 * A saved template's identifier names a file, so nothing outside the pattern
 * reaches the service. A starter's identifier carries a prefix the pattern
 * rejects, which is exactly what keeps it from ever naming one.
 */
export function isTemplateIdRequest(value: unknown): value is TemplateIdRequest {
  if (!value || typeof value !== 'object') return false
  const id = (value as Partial<TemplateIdRequest>).id
  if (typeof id !== 'string' || id.length > 96) return false
  return TEMPLATE_ID_PATTERN.test(id) || id.startsWith(BUNDLED_TEMPLATE_PREFIX)
}

export function invalidConfigurationRequest(): DeviceResult<never> {
  return {
    ok: false,
    error: { code: 'invalid_request', message: 'Invalid device configuration request.' }
  }
}

export function isFontUploadRequest(value: unknown): value is FontUploadRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<FontUploadRequest>
  return (
    Array.isArray(request.assets) &&
    request.assets.length <= MAXIMUM_FONT_FAMILIES &&
    request.assets.every(isFontAssetInput)
  )
}

// Shape only: the family rules and the source lookup belong to the service,
// which re-validates every request before it touches a device.
export function isFontAssetInput(value: unknown): value is FontAssetInput {
  if (!value || typeof value !== 'object') return false
  const asset = value as Partial<FontAssetInput>
  return (
    typeof asset.sourceId === 'string' && asset.sourceId.length > 0 &&
    asset.sourceId.length <= 128 && typeof asset.family === 'string'
  )
}

export function isFirmwareUploadRequest(value: unknown): value is FirmwareUploadRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<FirmwareUploadRequest>
  return (
    typeof request.sourceId === 'string' &&
    request.sourceId.length > 0 &&
    request.sourceId.length <= 128
  )
}

export function isSimHubProfileExportRequest(value: unknown): value is SimHubProfileExportRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<SimHubProfileExportRequest>
  return (
    Array.isArray(request.fieldNames) &&
    request.fieldNames.length > 0 &&
    request.fieldNames.length <= 256 &&
    request.fieldNames.every(
      (name) => typeof name === 'string' && name.length > 0 && name.length <= 39
    ) &&
    typeof request.baudRate === 'number' &&
    Number.isInteger(request.baudRate) &&
    request.baudRate >= 9_600 &&
    request.baudRate <= 2_000_000
  )
}
