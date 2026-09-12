import { useEffect, useMemo, useState } from 'react'

import { documentFonts } from '@shared/document-fonts'
import { MAXIMUM_FONT_FAMILIES, MAXIMUM_FONT_PACKAGE_SIZE } from '@shared/font-assets'
import { fontFamilyId, type FontLibraryEntry } from '@shared/font-library'

import { Button } from '@/components/ui/button'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { useDeviceStore } from '@/features/device/device-store'
import { catalogPreviewFamily, useFontCatalogStore } from './font-catalog-store'
import { FontCatalogRow } from './FontCatalogRow'
import { useFontFaceStore } from './font-face-store'
import { FontPickerRow } from './FontPickerRow'
import { dashboardFontFootprint, kilobytes, useFontLibraryStore } from './font-library-store'
import { t } from '@shared/ui-text'

const CATALOG_RESULT_LIMIT = 60

export function FontPicker({
  value,
  onChoose,
  onClose
}: {
  value: string | undefined
  onChoose: (id: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [importError, setImportError] = useState<string>()
  const [importing, setImporting] = useState(false)
  const [expanded, setExpanded] = useState<string>()
  const [adding, setAdding] = useState<string>()
  const catalog = useFontCatalogStore((state) => state.families)
  const catalogPreviews = useFontCatalogStore((state) => state.previews)
  const catalogPreviewIds = useFontCatalogStore((state) => state.previewIds)
  const catalogTabular = useFontCatalogStore((state) => state.tabular)
  const loadCatalog = useFontCatalogStore((state) => state.load)
  const requestPreview = useFontCatalogStore((state) => state.requestPreview)
  const entries = useFontLibraryStore((state) => state.entries)
  const loaded = useFontFaceStore((state) => state.loaded)
  const ensureFaces = useFontFaceStore((state) => state.ensureFaces)
  const draft = useDeviceStore((state) => state.draft)

  const families = useMemo(
    () =>
      documentFonts(draft)
        .map((font) => font?.family)
        .filter((family): family is string => Boolean(family)),
    [draft]
  )
  const used = useMemo(() => [...new Set(families)], [families])
  const replaced =
    value !== undefined && families.filter((family) => family === value).length === 1
      ? value
      : undefined
  const footprint = dashboardFontFootprint(entries, used)
  const budget = dashboardFontFootprint(
    entries,
    replaced ? used.filter((family) => family !== replaced) : used
  )
  const budgetSpent = budget.families >= MAXIMUM_FONT_FAMILIES

  useEffect(() => {
    void ensureFaces(entries.map((entry) => entry.id))
  }, [ensureFaces, entries])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  const needle = query.trim().toLowerCase()
  const matches = (entry: FontLibraryEntry): boolean => {
    if (!needle) return true
    return (
      entry.name.toLowerCase().includes(needle) ||
      entry.id.includes(needle) ||
      (entry.category ?? '').toLowerCase().includes(needle)
    )
  }

  const inDashboard = entries.filter((entry) => used.includes(entry.id)).filter(matches)
  const library = entries.filter((entry) => !used.includes(entry.id)).filter(matches)

  const reasonFor = (entry: FontLibraryEntry): string | undefined => {
    if (used.includes(entry.id)) return undefined
    if (budgetSpent) return t('fonts.fontPicker.theBoardHoldsMaximumFont', { maximum: MAXIMUM_FONT_FAMILIES })
    if (budget.bytes + entry.bytes > MAXIMUM_FONT_PACKAGE_SIZE) {
      return t('fonts.fontPicker.addingThisFaceWouldPush')
    }
    return undefined
  }

  const catalogMatches = useMemo(() => {
    const search = query.trim().toLowerCase()
    const known = new Set(entries.map((entry) => entry.id))
    return catalog
      .filter((family) =>
        search
          ? family.name.toLowerCase().includes(search) ||
            family.category.toLowerCase().includes(search)
          : true
      )
      .filter((family) =>
        family.variants.some((variant) => !known.has(fontFamilyId(family.name, variant) ?? ''))
      )
      .slice(0, CATALOG_RESULT_LIMIT)
  }, [catalog, entries, query])

  const addFromCatalog = async (familyName: string, variant: string): Promise<void> => {
    setAdding(familyName)
    setImportError(undefined)
    const result = await window.pitrig
      .addFontFromCatalog({ family: familyName, variant })
      .catch(() => undefined)
    setAdding(undefined)
    if (!result) return setImportError(t('fonts.catalogSection.theFontCouldNotBe'))
    if (!result.ok) return setImportError(result.error.message)
    onChoose(result.value.id)
  }

  const importFace = async (): Promise<void> => {
    setImporting(true)
    setImportError(undefined)
    const result = await window.pitrig.importFontFace({}).catch(() => undefined)
    setImporting(false)
    if (!result) return setImportError(t('fonts.fontsPage.theFontCouldNotBe'))
    if (!result.ok) return setImportError(result.error.message)
    if (result.value) onChoose(result.value.id)
  }

  return (
    <ModalDialog
      label={t('fonts.fontPicker.chooseAFont')}
      className="flex max-h-[80vh] w-[32rem] flex-col overflow-hidden"
      onClose={onClose}
    >
      <div className="space-y-2 border-b p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t('fonts.fontPicker.chooseAFont')}</h2>
          <p className="text-muted-foreground">
            {t('fonts.footprint', { families: footprint.families, maximum: MAXIMUM_FONT_FAMILIES, kilobytes: kilobytes(footprint.bytes) })}
          </p>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('fonts.fontPicker.searchFonts')}
          className="h-8 w-full rounded-md border bg-background px-2 text-foreground"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <Group title={t('fonts.fontPicker.inThisDashboard')} hint={t('fonts.fontPicker.alreadyUsedSoItCosts')}>
          {inDashboard.map((entry) => (
            <FontPickerRow
              key={entry.id}
              entry={entry}
              selected={entry.id === value}
              loaded={Boolean(loaded[entry.id])}
              onChoose={() => onChoose(entry.id)}
            />
          ))}
        </Group>
        <Group title={t('fonts.fontPicker.library')} hint={t('fonts.fontPicker.bundledWithTheAppImported')}>
          {library.map((entry) => (
            <FontPickerRow
              key={entry.id}
              entry={entry}
              selected={entry.id === value}
              loaded={Boolean(loaded[entry.id])}
              disabledReason={reasonFor(entry)}
              onChoose={() => onChoose(entry.id)}
            />
          ))}
        </Group>
        <Group
          title={t('fonts.fontPicker.googleFonts')}
          hint={
            needle
              ? t('fonts.fontPicker.downloadedWhenYouPickA')
              : t('fonts.fontPicker.mostUsedFirstSearchTo', { length: catalog.length })
          }
        >
          {catalogMatches.map((family) => (
            <FontCatalogRow
              key={family.name}
              family={family}
              previewFamily={catalogPreviewFamily(catalogPreviews, catalogPreviewIds, family.name)}
              tabularDigits={catalogTabular[family.name]}
              unavailable={catalogPreviews[family.name] === 'unavailable'}
              expanded={expanded === family.name}
              disabledReason={
                adding === family.name
                  ? t('fonts.fontPicker.downloading')
                  : budgetSpent
                    ? t('fonts.fontPicker.theBoardHoldsMaximumFont', { maximum: MAXIMUM_FONT_FAMILIES })
                    : undefined
              }
              onVisible={() => requestPreview(family.name)}
              onToggle={() => setExpanded(expanded === family.name ? undefined : family.name)}
              onChoose={(variant) => void addFromCatalog(family.name, variant)}
            />
          ))}
        </Group>
        {inDashboard.length + library.length + catalogMatches.length === 0 ? (
          <p className="rounded-md border p-2 text-muted-foreground">
            {t('fonts.fontPicker.nothingMatches', { query })}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t p-3">
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {importError ?? t('fonts.fontPicker.aWeightIsItsOwn')}
        </span>
        <Button variant="outline" disabled={importing} onClick={() => void importFace()}>
          {importing ? t('fonts.fontPicker.importing') : t('fonts.fontsPage.importFont')}
        </Button>
        <Button variant="outline" onClick={onClose}>
          {t('common.close')}</Button>
      </div>
    </ModalDialog>
  )
}

function Group({
  title,
  hint,
  children
}: {
  title: string
  hint: string
  children: React.ReactNode
}): React.JSX.Element | null {
  const items = Array.isArray(children) ? children : [children]
  if (items.flat().filter(Boolean).length === 0) return null
  return (
    <section className="space-y-1">
      <h3 className="font-medium text-foreground">{title}</h3>
      <p className="text-[0.65rem] text-muted-foreground">{hint}</p>
      <div className="space-y-1">{children}</div>
    </section>
  )
}
