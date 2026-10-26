import { SIMHUB_PROFILE_ENTRIES } from '@shared/simhub-profile-data'
import { TELEMETRY_CATALOG, TELEMETRY_GAMES, type TelemetryCatalogEntry } from '@shared/telemetry-catalog'

export interface TelemetryReferenceEntry extends TelemetryCatalogEntry {
  simHubProperty?: string
}

const PROPERTIES = new Map<string, string | undefined>(
  SIMHUB_PROFILE_ENTRIES.map((entry) => [entry.name, 'property' in entry ? entry.property : undefined])
)

const TELEMETRY_REFERENCE: TelemetryReferenceEntry[] = TELEMETRY_CATALOG.map(
  (entry: TelemetryCatalogEntry) => {
    const property = PROPERTIES.get(entry.name)
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
      entry.simHubProperty ?? '',
      ...(entry.games ?? []).map((game) => TELEMETRY_GAMES[game])
    ].some((field) => field.toLowerCase().includes(needle))
  )
}
