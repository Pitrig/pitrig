import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { EmptyState, PageSection } from '@/app/workspace/PageShell'
import {
  readLiveValue,
  telemetryIsLive,
  useSlowRevision
} from '@/features/telemetry/live-telemetry'
import { TELEMETRY_BRIDGE_INCLUDED } from '@shared/telemetry-bridge'
import { rawText } from '@shared/telemetry-value'
import { searchTelemetryReference } from './telemetry-reference'
import { t } from '@shared/ui-text'

export function CatalogSection(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const entries = useMemo(() => searchTelemetryReference(query), [query])
  useSlowRevision()
  const live = telemetryIsLive()

  return (
    <PageSection
      title={t('protocol.catalogSection.telemetryCatalog')}
      description={t('protocol.catalogSection.lengthOfLength2FieldsA', { length: entries.length, length2: searchTelemetryReference('').length })}
      actions={
        <>
          {live ? <Badge variant="outline">{t('protocol.catalogSection.live')}</Badge> : null}
          <label className="flex h-8 items-center gap-1.5 rounded-md border bg-background px-2">
          <Search aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <input
            aria-label={t('protocol.catalogSection.searchTelemetryFields')}
            className="w-44 bg-transparent text-xs outline-none"
            placeholder={t('protocol.catalogSection.fuelRpmLap')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          </label>
        </>
      }
      className="px-0 pb-0"
    >
      {entries.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyState title={t('protocol.catalogSection.noFieldMatches')}>
            {t('protocol.catalogSection.tryAShorterWordThe')}</EmptyState>
        </div>
      ) : (
        <div className="max-h-96 overflow-auto border-t">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 bg-card text-[11px] text-muted-foreground">
              <tr>
                <th className="px-4 py-1.5 font-medium">{t('protocol.catalogSection.field')}</th>
                {TELEMETRY_BRIDGE_INCLUDED ? (
                  <th className="px-2 py-1.5 font-medium">{t('protocol.catalogSection.value')}</th>
                ) : null}
                <th className="px-2 py-1.5 font-medium">{t('protocol.catalogSection.wire')}</th>
                <th className="px-2 py-1.5 font-medium">{t('protocol.catalogSection.type')}</th>
                <th className="px-2 py-1.5 font-medium">{t('protocol.catalogSection.unit')}</th>
                <th className="px-4 py-1.5 font-medium">{t('protocol.catalogSection.simHubProperty')}</th>
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
                  {TELEMETRY_BRIDGE_INCLUDED ? (
                    <td className="px-2 py-1.5 font-mono tabular-nums">
                      {rawText(readLiveValue(entry.name)) ?? '—'}
                    </td>
                  ) : null}
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
