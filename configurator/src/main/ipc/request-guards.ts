import {
  IMAGE_COLOR_FORMATS,
  type ImageUploadRequest
} from '@shared/image-assets'
import {
  MAXIMUM_CONFIGURATION_TEXT_SIZE,
  isConfigurationDocumentId
} from '@shared/configuration-documents'
import type {
  FontCatalogPreviewRequest,
  FontFacesRequest,
  FontLibraryAddRequest,
  FontLibraryIdRequest,
  FontLibraryImportRequest
} from '@shared/font-library'
import {
  CONFIGURATION_ID_PATTERN,
  MAXIMUM_CONFIGURATION_NAME,
  type ConfigurationIdRequest,
  type ConfigurationPathRequest,
  type ConfigurationSaveRequest
} from '@shared/config-library'
import { type FirmwareUploadRequest } from '@shared/firmware-update'
import type {
  ConnectDeviceRequest,
  DeviceConfigurationRequest,
  DeviceConfigurationResetRequest,
  DeviceResult
} from '@shared/device'
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
import { SIMCORE_BOARD_IDS, type SimCoreBoardId } from '@shared/device'
import { t } from '@shared/ui-text'

export function isImageUploadRequest(value: unknown): value is ImageUploadRequest {
  if (typeof value !== 'object' || value === null) return false
  const assets = (value as ImageUploadRequest).assets
  return (
    Array.isArray(assets) &&
    assets.every(
      (asset) =>
        typeof asset === 'object' &&
        asset !== null &&
        Array.isArray(asset.sourceIds) &&
        asset.sourceIds.every((sourceId) => typeof sourceId === 'string') &&
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

export function isConfigurationResetRequest(
  value: unknown
): value is DeviceConfigurationResetRequest | undefined {
  if (value === undefined || value === null) return true
  if (typeof value !== 'object') return false
  const request = value as Partial<DeviceConfigurationResetRequest>
  return request.document === undefined || isConfigurationDocumentId(request.document)
}

export function isJsonDocumentRequest(
  value: unknown
): value is DeviceConfigurationRequest & ConfigurationFileSaveRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<DeviceConfigurationRequest>
  if (typeof request.json !== 'string') return false
  if (request.json.length > MAXIMUM_CONFIGURATION_TEXT_SIZE) return false
  if (request.documents === undefined) return true
  return (
    Array.isArray(request.documents) &&
    request.documents.every(
      (document) => typeof document === 'string' && isConfigurationDocumentId(document)
    )
  )
}

export function isTemplateSaveRequest(value: unknown): value is TemplateSaveRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<TemplateSaveRequest> & { board?: unknown }
  if (request.kind !== 'dashboard' && request.kind !== 'widget') return false
  if (typeof request.name !== 'string' || request.name.length > MAXIMUM_TEMPLATE_NAME) return false
  if (
    request.description !== undefined &&
    (typeof request.description !== 'string' ||
      request.description.length > MAXIMUM_TEMPLATE_DESCRIPTION)
  ) {
    return false
  }
  if (
    request.kind === 'widget' &&
    !SIMCORE_BOARD_IDS.includes(request.board as SimCoreBoardId)
  ) {
    return false
  }
  return typeof request.json === 'string' && request.json.length <= MAXIMUM_CONFIGURATION_TEXT_SIZE
}

export function isTemplateIdRequest(value: unknown): value is TemplateIdRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<TemplateIdRequest>
  if (request.kind !== 'dashboard' && request.kind !== 'widget') return false
  const id = request.id
  if (typeof id !== 'string' || id.length > 96) return false
  return TEMPLATE_ID_PATTERN.test(id) || id.startsWith(BUNDLED_TEMPLATE_PREFIX)
}

export function isConfigurationIdRequest(value: unknown): value is ConfigurationIdRequest {
  if (!value || typeof value !== 'object') return false
  const id = (value as Partial<ConfigurationIdRequest>).id
  return typeof id === 'string' && CONFIGURATION_ID_PATTERN.test(id)
}

export function isConfigurationSaveRequest(value: unknown): value is ConfigurationSaveRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<ConfigurationSaveRequest>
  return (
    typeof request.name === 'string' &&
    request.name.length <= MAXIMUM_CONFIGURATION_NAME &&
    typeof request.json === 'string' &&
    request.json.length <= MAXIMUM_CONFIGURATION_TEXT_SIZE
  )
}

export function isConfigurationPathRequest(value: unknown): value is ConfigurationPathRequest {
  if (!value || typeof value !== 'object') return false
  const path = (value as Partial<ConfigurationPathRequest>).path
  return typeof path === 'string' && path.length > 0 && path.length <= 4096
}

export function invalidConfigurationRequest(): DeviceResult<never> {
  return {
    ok: false,
    error: { code: 'invalid_request', message: t('ipc.requestGuards.invalidDeviceConfigurationRequest') }
  }
}

export function isFontFacesRequest(value: unknown): value is FontFacesRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<FontFacesRequest>
  return (
    Array.isArray(request.ids) &&
    request.ids.length <= 64 &&
    request.ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 31)
  )
}

export function isFontLibraryImportRequest(value: unknown): value is FontLibraryImportRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<FontLibraryImportRequest>
  return request.id === undefined || (typeof request.id === 'string' && request.id.length <= 31)
}

export function isFontCatalogPreviewRequest(
  value: unknown
): value is FontCatalogPreviewRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<FontCatalogPreviewRequest>
  return typeof request.family === 'string' && request.family.length > 0 &&
    request.family.length <= 128
}

export function isFontLibraryAddRequest(value: unknown): value is FontLibraryAddRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<FontLibraryAddRequest>
  return (
    typeof request.family === 'string' && request.family.length > 0 &&
    request.family.length <= 128 &&
    typeof request.variant === 'string' && request.variant.length <= 16 &&
    (request.category === undefined || typeof request.category === 'string')
  )
}

export function isFontLibraryIdRequest(value: unknown): value is FontLibraryIdRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<FontLibraryIdRequest>
  return typeof request.id === 'string' && request.id.length > 0 && request.id.length <= 31
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
