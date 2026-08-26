import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { EmptyState, PageSection } from '@/app/workspace/PageShell'
import { searchTelemetryReference } from './telemetry-reference'

export function CatalogSection(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const entries = useMemo(() => searchTelemetryReference(query), [query])

  return (
    <PageSection
      title="Telemetry catalog"
      description={`${entries.length} of ${searchTelemetryReference('').length} fields. A widget binds one of these names; the wire id is what actually travels.`}
      actions={
        <label className="flex h-8 items-center gap-1.5 rounded-md border bg-background px-2">
          <Search aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <input
            aria-label="Search telemetry fields"
            className="w-44 bg-transparent text-xs outline-none"
            placeholder="fuel, rpm, lap…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      }
      className="px-0 pb-0"
    >
      {entries.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyState title="No field matches">
            Try a shorter word — the search covers the name, the wire id, the unit, the category and
            the SimHub property.
          </EmptyState>
        </div>
      ) : (
        <div className="max-h-96 overflow-auto border-t">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 bg-card text-[11px] text-muted-foreground">
              <tr>
                <th className="px-4 py-1.5 font-medium">Field</th>
                <th className="px-2 py-1.5 font-medium">Wire</th>
                <th className="px-2 py-1.5 font-medium">Type</th>
                <th className="px-2 py-1.5 font-medium">Unit</th>
                <th className="px-4 py-1.5 font-medium">SimHub property</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.name} className="border-t align-top">
                  <td className="px-4 py-1.5">
                    <span className="font-mono">{entry.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {entry.description}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-muted-foreground">{entry.wireId}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{entry.type}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{entry.unit}</td>
                  <td className="px-4 py-1.5">
                    <span
                      className="block max-w-xs truncate font-mono text-[11px] text-muted-foreground"
                      title={entry.simHubProperty}
                    >
                      {entry.simHubProperty ?? '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageSection>
  )
}
