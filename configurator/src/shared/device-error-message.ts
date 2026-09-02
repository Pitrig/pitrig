import { VALIDATION_ERROR_TOKENS, type ValidationErrorToken } from './configuration-schema'
import { t } from './ui-text'

const UPLOAD_KINDS = ['FONT', 'IMAGE', 'FW'] as const
const REQUEST_TOKENS = ['storage', 'unsupported', 'unknown_command', 'busy'] as const
const UPLOAD_TOKENS = [
  'busy',
  'timeout',
  'frame_crc',
  'sequence',
  'protocol_overrun',
  'invalid_frame',
  'incomplete_package',
  'invalid_size',
  'invalid_package',
  'invalid_state',
  'reboot_required',
  'storage_failure',
  'unavailable',
  'unknown',
  'unknown_command'
] as const
const DEPENDENCY_TOKENS = ['font', 'image'] as const

type UploadKind = (typeof UPLOAD_KINDS)[number]
type RequestToken = (typeof REQUEST_TOKENS)[number]
type UploadToken = (typeof UPLOAD_TOKENS)[number]
type DependencyToken = (typeof DEPENDENCY_TOKENS)[number]

const isValidationToken = (value: string): value is ValidationErrorToken =>
  (VALIDATION_ERROR_TOKENS as readonly string[]).includes(value)

const isUploadKind = (value: string): value is UploadKind =>
  (UPLOAD_KINDS as readonly string[]).includes(value)

const isRequestToken = (value: string): value is RequestToken =>
  (REQUEST_TOKENS as readonly string[]).includes(value)

const isUploadToken = (value: string): value is UploadToken =>
  (UPLOAD_TOKENS as readonly string[]).includes(value)

const isDependencyToken = (value: string): value is DependencyToken =>
  (DEPENDENCY_TOKENS as readonly string[]).includes(value)

const parseDetail = (
  detail: string
): { screen?: number; widget?: number; path?: string } => {
  const result: { screen?: number; widget?: number; path?: string } = {}
  for (const part of detail.split(',')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (key === 'path') {
      if (value) result.path = value
      continue
    }
    if (key !== 'screen' && key !== 'widget') continue
    const index = Number.parseInt(value, 10)
    if (Number.isInteger(index) && index >= 0) result[key] = index
  }
  return result
}

const describeLocation = (screen?: number, widget?: number): string => {
  const parts: string[] = []
  if (screen !== undefined) parts.push(t('device.error.locationScreen', { number: screen + 1 }))
  if (widget !== undefined) parts.push(t('device.error.locationWidget', { number: widget + 1 }))
  return parts.length > 0 ? t('device.error.location', { parts: parts.join(', ') }) : ''
}

const describeUpload = (kind: UploadKind, rest: string): string => {
  const word = rest.trim()
  const label = t(`device.error.uploadKind.${kind}`)
  return isUploadToken(word)
    ? t('device.error.uploadFailed', { kind: label, reason: t(`device.error.upload.${word}`) })
    : t('device.error.uploadFailedRaw', {
        kind: label,
        reason: word || t('device.error.noReasonGiven')
      })
}

const describeValidation = (head: ValidationErrorToken, rest: string): string => {
  const { screen, widget, path } = parseDetail(rest)
  if (head === 'invalid_widget' && path && isDependencyToken(path)) {
    return t(`device.error.dependency.${path}`)
  }
  return t('device.error.validationDetail', {
    message: t(`device.error.validation.${head}`),
    location: describeLocation(screen, widget),
    property: path ? t('device.error.property', { path }) : ''
  })
}

export const describeDeviceError = (payload: string): string => {
  const text = payload.trim()
  if (!text) return t('device.error.noReason')

  const separator = text.indexOf(':')
  const head = separator < 0 ? text : text.slice(0, separator)
  const rest = separator < 0 ? '' : text.slice(separator + 1)

  if (isUploadKind(head)) return describeUpload(head, rest)
  if (isValidationToken(head)) return describeValidation(head, rest)
  if (isRequestToken(head)) return t(`device.error.request.${head}`)
  return t('device.error.rejected', { text })
}
