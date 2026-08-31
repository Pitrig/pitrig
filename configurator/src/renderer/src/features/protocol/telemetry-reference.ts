import { SIMHUB_PROFILE_ENTRIES } from '@shared/simhub-profile-data'
import { TELEMETRY_CATALOG, type TelemetryCatalogEntry } from '@shared/telemetry-catalog'

export interface TelemetryReferenceEntry extends TelemetryCatalogEntry {
  simHubProperty?: string
}

const PROPERTY_PATTERN = /\[([^\]]+)\]/

const EXPRESSIONS = new Map<string, string>(
  SIMHUB_PROFILE_ENTRIES.map((entry) => [entry.name, entry.expression])
)

const TELEMETRY_REFERENCE: TelemetryReferenceEntry[] = TELEMETRY_CATALOG.map(
  (entry: TelemetryCatalogEntry) => {
    const property = PROPERTY_PATTERN.exec(EXPRESSIONS.get(entry.name) ?? '')?.[1]
    return property ? { ...entry, simHubProperty: property } : entry
  }
)

export function searchTelemetryReference(query: string): TelemetryReferenceEntry[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return TELEMETRY_REFERENCE
  return TELEMETRY_REFERENCE.filter((entry) =>
    [
      entry.name,
      entry.wireId,
      entry.unit,
      entry.categoryLabel,
      entry.description,
      entry.simHubProperty ?? ''
    ].some((field) => field.toLowerCase().includes(needle))
  )
}
