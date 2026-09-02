import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { FontVariant } from '@shared/font-library'

import { EmptyState, PageSection } from '@/app/workspace/PageShell'
import { catalogPreviewFamily, useFontCatalogStore } from './font-catalog-store'
import { FontCatalogRow } from './FontCatalogRow'
import { t } from '@shared/ui-text'

const CATALOG_RESULT_LIMIT = 60

export function CatalogSection({ onMessage }: { onMessage: (message: string) => void }): React.JSX.Element {
  const catalog = useFontCatalogStore((state) => state.families)
  const previews = useFontCatalogStore((state) => state.previews)
  const previewIds = useFontCatalogStore((state) => state.previewIds)
  const tabular = useFontCatalogStore((state) => state.tabular)
  const loadCatalog = useFontCatalogStore((state) => state.load)
  const requestPreview = useFontCatalogStore((state) => state.requestPreview)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string>()
  const [adding, setAdding] = useState<string>()

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return catalog
      .filter((family) => needle.length === 0 || family.name.toLowerCase().includes(needle))
      .slice(0, CATALOG_RESULT_LIMIT)
  }, [catalog, query])

  const add = async (familyName: string, variant: FontVariant): Promise<void> => {
    setAdding(familyName)
    const result = await window.simcore
      .addFontFromCatalog({ family: familyName, variant })
      .catch(() => undefined)
    setAdding(undefined)
    if (!result) return onMessage('The font could not be downloaded.')
    onMessage(result.ok ? `Added ${result.value.name} to the library.` : result.error.message)
  }

  return (
    <PageSection
      title={t('fonts.catalogSection.addFromGoogleFonts')}
      description={t('fonts.catalogSection.downloadedIntoTheLibraryOn')}
      actions={
        <label className="flex h-8 items-center gap-1.5 rounded-md border bg-background px-2">
          <Search aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <input
            aria-label={t('fonts.catalogSection.searchGoogleFonts')}
            className="w-44 bg-transparent text-xs outline-none"
            placeholder={t('fonts.catalogSection.orbitronInter')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      }
    >
      {catalog.length === 0 ? (
        <p className="text-muted-foreground">{t('fonts.catalogSection.readingTheCatalog')}</p>
      ) : results.length === 0 ? (
        <EmptyState title={t('fonts.catalogSection.noFamilyMatches')}>{t('fonts.catalogSection.tryAShorterWord')}</EmptyState>
      ) : (
        <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
          {results.map((family) => (
            <FontCatalogRow
              key={family.name}
              family={family}
              previewFamily={catalogPreviewFamily(previews, previewIds, family.name)}
              tabularDigits={tabular[family.name]}
              unavailable={previews[family.name] === 'unavailable'}
              expanded={expanded === family.name}
              disabledReason={adding === family.name ? 'Downloading…' : undefined}
              onVisible={() => requestPreview(family.name)}
              onToggle={() => setExpanded(expanded === family.name ? undefined : family.name)}
              onChoose={(variant) => void add(family.name, variant)}
            />
          ))}
        </div>
      )}
    </PageSection>
  )
}
