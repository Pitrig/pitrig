import {
  BOARD_PROFILES,
  CONFIGURATION_SCHEMA_VERSION,
  SIMCORE_BOARD_IDS,
  type ConfigurationDocumentOutcome,
  type ConfigurationDocumentState,
  type DeviceHealth,
  type DeviceInfo,
  type DeviceResetCause,
  type DeviceStartupPhase,
  type SimCoreBoardId
} from '@shared/device'
import {
  CONFIGURATION_DOCUMENT_IDS,
  type ConfigurationDocumentId
} from '@shared/configuration-schema'
import { DeviceServiceError } from './device-errors'

export function parseFields(line: string, prefix: string, fieldName: string): Map<string, string> {
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

export function isBooleanField(value: string | undefined): boolean {
  return value === '0' || value === '1'
}

export interface AssetStatusLimits {
  prefix: string
  label: string
  countField: string
  maximumCount: number
  formatVersion: number
  minimumFormatVersion?: number
  maximumPackageSize: number
}

export interface AssetStatus {
  storageAvailable: boolean
  packageAvailable: boolean
  rebootRequired: boolean
  formatVersion: number
  count: number
  packageSize: number
  entries: string | undefined
  crc: string | undefined
}

export function parseAssetStatus(line: string, limits: AssetStatusLimits): AssetStatus {
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
  const documents = {} as Record<ConfigurationDocumentId, ConfigurationDocumentState>
  for (const document of CONFIGURATION_DOCUMENT_IDS) {
    documents[document] = parseDocumentState(fields.get(document))
  }
  const health = parseDeviceHealth(fields)
  return {
    boardId: board,
    firmwareVersion,
    schemaVersion: CONFIGURATION_SCHEMA_VERSION,
    display: BOARD_PROFILES[board].display,
    documents,
    storageAvailable: fields.get('storage') === '1',
    ...(health ? { health } : {})
  }
}

const RESET_CAUSES: readonly DeviceResetCause[] = [
  'power_on',
  'software',
  'panic',
  'task_watchdog',
  'brownout',
  'other'
]

const STARTUP_PHASES: readonly DeviceStartupPhase[] = [
  'none',
  'configuration',
  'link',
  'display',
  'assets',
  'composition',
  'complete'
]

function parseDeviceHealth(fields: Map<string, string>): DeviceHealth | undefined {
  const safeMode = fields.get('safe_mode')
  if (safeMode === undefined) return undefined
  const bootFailures = Number(fields.get('boot_failures'))
  const resetCause = fields.get('reset_reason')
  const lastPhase = fields.get('last_phase')
  if (
    !isBooleanField(safeMode) ||
    !Number.isSafeInteger(bootFailures) ||
    bootFailures < 0 ||
    bootFailures > 255 ||
    !RESET_CAUSES.includes(resetCause as DeviceResetCause) ||
    !STARTUP_PHASES.includes(lastPhase as DeviceStartupPhase)
  ) {
    throw new DeviceServiceError('not_simcore', 'The device returned malformed INFO data.')
  }
  return {
    safeMode: safeMode === '1',
    bootFailures,
    resetCause: resetCause as DeviceResetCause,
    lastPhase: lastPhase as DeviceStartupPhase
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

export { parseFirmwareUpdateInfo, parseFontAssetInfo, parseImageAssetInfo } from './asset-info-parsers'
