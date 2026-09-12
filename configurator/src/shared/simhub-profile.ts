import { telemetryBindings } from './configuration-access'
import type { DeviceConfiguration } from './device'
import {
  SIMHUB_PROFILE_DEFAULTS,
  SIMHUB_PROFILE_ENTRIES
} from './simhub-profile-data'
import { t } from './ui-text'

export const SIMHUB_PROFILE_EXPORT_CHANNEL = 'simhub-profile:export' as const
export const SIMHUB_PROFILE_FILE_NAME = 'Pitrig-telemetry.shsds'

export type SimHubProfileMode = 'all' | 'dashboard'

export interface SimHubProfileExportRequest {
  fieldNames: string[]
  baudRate: number
}

export interface SimHubProfileExportValue {
  saved: boolean
  fileName?: string
}

export interface SimHubProfileError {
  code: 'invalid_request' | 'write_failed'
  message: string
}

export type SimHubProfileResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SimHubProfileError }

export interface RequiredTelemetrySelection {
  fieldNames: string[]
  unknownBindings: string[]
}

const PROFILE_FIELD_NAMES = new Set<string>(
  SIMHUB_PROFILE_ENTRIES.map(({ name }) => name)
)

export function allTelemetryFieldNames(): string[] {
  return SIMHUB_PROFILE_ENTRIES.map(({ name }) => name)
}

export function collectRequiredTelemetry(
  configuration: DeviceConfiguration
): RequiredTelemetrySelection {
  const requested = new Set<string>()
  const unknownBindings = new Set<string>()
  for (const binding of telemetryBindings(configuration)) {
    if (PROFILE_FIELD_NAMES.has(binding)) requested.add(binding)
    else unknownBindings.add(binding)
  }

  return {
    fieldNames: SIMHUB_PROFILE_ENTRIES
      .filter(({ name }) => requested.has(name))
      .map(({ name }) => name),
    unknownBindings: [...unknownBindings].sort()
  }
}

export function effectiveSimHubBaudRate(configuration: DeviceConfiguration): number {
  const configured = configuration.telemetry_transport?.uart?.baud_rate
  return Number.isInteger(configured) && configured !== undefined &&
    configured >= 9_600 && configured <= 2_000_000
    ? configured
    : SIMHUB_PROFILE_DEFAULTS.baudRate
}

export function generateSimHubProfile(fieldNames: readonly string[], baudRate: number): string {
  if (!Number.isInteger(baudRate) || baudRate < 9_600 || baudRate > 2_000_000) {
    throw new Error(t('protocol.simHubProfile.simHubProfileBaudRateMust'))
  }

  const selected = new Set(fieldNames)
  const entries = SIMHUB_PROFILE_ENTRIES.filter(({ name }) => selected.has(name))
  if (entries.length !== selected.size) {
    const unknown = [...selected].filter((name) => !PROFILE_FIELD_NAMES.has(name))
    throw new Error(t('protocol.simHubProfile.unknownSimHubTelemetryFields', { fields: unknown.join(', ') }))
  }

  const document = {
    AutomaticReconnect: true,
    SerialPortName: '',
    StartupDelayMs: 0,
    IsConnecting: false,
    IsEnabled: true,
    LogIncomingData: false,
    IsConnected: false,
    BaudRate: baudRate,
    DtrEnable: false,
    RtsEnable: false,
    EditorExpanded: true,
    Name: SIMHUB_PROFILE_DEFAULTS.name,
    Description: SIMHUB_PROFILE_DEFAULTS.description,
    LastErrorDate: '0001-01-01T00:00:00+00:00',
    LastErrorMessage: null,
    IsFreezed: false,
    SettingsBuilder: { Settings: [], IsEditMode: false },
    OnConnectMessage: { Expression: '' },
    OnDisconnectMessage: { Expression: '' },
    UpdateMessages: entries.map(({ expression, maximumFrequency }) => ({
      Message: { Expression: expression },
      IsEnabled: true,
      MaximumFrequency: maximumFrequency
    }))
  }

  return `${JSON.stringify(document, null, 2)}\n`
}
