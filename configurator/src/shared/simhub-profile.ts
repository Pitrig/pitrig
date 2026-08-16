import { allWidgetsOf, isDeltaTimeWidget } from './configuration-access'
import type { DeviceConfiguration } from './device'
import {
  SIMHUB_PROFILE_DEFAULTS,
  SIMHUB_PROFILE_ENTRIES
} from './simhub-profile-data'

export const SIMHUB_PROFILE_EXPORT_CHANNEL = 'simhub-profile:export' as const
export const SIMHUB_PROFILE_FILE_NAME = 'SimCore-telemetry.shsds'

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

export interface DashboardTelemetrySelection {
  fieldNames: string[]
  unknownBindings: string[]
}

const PROFILE_FIELD_NAMES = new Set<string>(
  SIMHUB_PROFILE_ENTRIES.map(({ name }) => name)
)

export function allTelemetryFieldNames(): string[] {
  return SIMHUB_PROFILE_ENTRIES.map(({ name }) => name)
}

export function collectDashboardTelemetry(
  configuration: DeviceConfiguration
): DashboardTelemetrySelection {
  const requested = new Set<string>()
  const unknownBindings = new Set<string>()
  for (const widget of allWidgetsOf(configuration)) {
    if (isDeltaTimeWidget(widget)) {
      requested.add('session.lap.delta')
      continue
    }
    for (const source of widget.sources ?? []) {
      if (source.binding) {
        if (PROFILE_FIELD_NAMES.has(source.binding)) requested.add(source.binding)
        else unknownBindings.add(source.binding)
      }
      if (
        Array.isArray(source.modifiers) &&
        source.modifiers.some((modifier) => modifier?.type === 'lap_timer')
      ) {
        requested.add('session.lap.current_time')
      }
    }
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
    throw new Error('SimHub profile baud rate must be an integer from 9600 to 2000000.')
  }

  const selected = new Set(fieldNames)
  const entries = SIMHUB_PROFILE_ENTRIES.filter(({ name }) => selected.has(name))
  if (entries.length !== selected.size) {
    const unknown = [...selected].filter((name) => !PROFILE_FIELD_NAMES.has(name))
    throw new Error(`Unknown SimHub telemetry fields: ${unknown.join(', ')}`)
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
