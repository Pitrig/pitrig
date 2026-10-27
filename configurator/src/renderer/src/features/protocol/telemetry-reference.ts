import { SIMHUB_PROPERTIES } from '@shared/simhub-data'
import { TELEMETRY_CATALOG, TELEMETRY_GAMES, type TelemetryCatalogEntry } from '@shared/telemetry-catalog'

export interface TelemetryReferenceEntry extends TelemetryCatalogEntry {
  simHubProperty?: string
}

const TELEMETRY_REFERENCE: TelemetryReferenceEntry[] = TELEMETRY_CATALOG.map(
  (entry: TelemetryCatalogEntry) => {
    const property = SIMHUB_PROPERTIES[entry.name]
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
