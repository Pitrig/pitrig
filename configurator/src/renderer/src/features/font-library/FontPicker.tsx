import { useEffect, useMemo, useRef, useState } from 'react'

import { documentFonts } from '@shared/document-fonts'
import { MAXIMUM_FONT_FAMILIES, MAXIMUM_FONT_PACKAGE_SIZE } from '@shared/font-assets'
import { fontFamilyId, type FontLibraryEntry } from '@shared/font-library'

import { Button } from '@/components/ui/button'
import { useDeviceStore } from '@/features/device/device-store'
import { catalogPreviewFamily, useFontCatalogStore } from './font-catalog-store'
import { FontCatalogRow } from './FontCatalogRow'
import { useFontFaceStore } from './font-face-store'
import { FontPickerRow } from './FontPickerRow'
import { dashboardFontFootprint, kilobytes, useFontLibraryStore } from './font-library-store'

/**
 * How many catalog rows are drawn at once. Every row on screen fetches its own
 * face, so the list is cut rather than virtualized: searching narrows it, and
 * nobody scrolls two thousand fonts looking for one.
 */
const CATALOG_RESULT_LIMIT = 60

/**
 * Choosing a font, with every candidate drawn in itself.
 *
 * The families the dashboard already uses come first, because taking one of
 * those is free: the board holds eight faces, and a widget that reuses a family
 * already on the screen spends none of them. Everything else costs a slot, and
 * the header says how many are left before the author spends one rather than
 * after the device refuses the document.
 */
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
  const searchRef = useRef<HTMLInputElement>(null)

  const used = useMemo(
    () => [
      ...new Set(
        documentFonts(draft)
          .map((font) => font?.family)
          .filter((family): family is string => Boolean(family))
      )
    ],
    [draft]
  )
  const footprint = dashboardFontFootprint(entries, used)
  const budgetSpent = footprint.families >= MAXIMUM_FONT_FAMILIES

  // Every listed face is drawn in itself, so every listed face has to be
  // registered. The library is small enough that this is one read.
  useEffect(() => {
    void ensureFaces(entries.map((entry) => entry.id))
  }, [ensureFaces, entries])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  useEffect(() => {
    searchRef.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const matches = (entry: FontLibraryEntry): boolean => {
    const needle = query.trim().toLowerCase()
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
    if (budgetSpent) return `The board holds ${MAXIMUM_FONT_FAMILIES} font families at a time.`
    if (footprint.bytes + entry.bytes > MAXIMUM_FONT_PACKAGE_SIZE) {
      return 'Adding this face would push the font package past 2 MiB.'
    }
    return undefined
  }

  // A catalog family the library already answers for is shown as a library
  // entry, not offered again — the picker should not have two ways to pick the
  // same face and disagree about whether it costs a slot.
  const known = new Set(entries.map((entry) => entry.id))
  const needle = query.trim().toLowerCase()
  const catalogMatches = catalog
    .filter((family) =>
      needle
        ? family.name.toLowerCase().includes(needle) ||
          family.category.toLowerCase().includes(needle)
        : true
    )
    .filter((family) =>
      family.variants.some((variant) => !known.has(fontFamilyId(family.name, variant) ?? ''))
    )
    .slice(0, CATALOG_RESULT_LIMIT)

  const addFromCatalog = async (familyName: string, variant: string): Promise<void> => {
    setAdding(familyName)
    setImportError(undefined)
    const result = await window.simcore
      .addFontFromCatalog({ family: familyName, variant })
      .catch(() => undefined)
    setAdding(undefined)
    if (!result) return setImportError('The font could not be downloaded.')
    if (!result.ok) return setImportError(result.error.message)
    onChoose(result.value.id)
  }

  const importFace = async (): Promise<void> => {
    setImporting(true)
    setImportError(undefined)
    const result = await window.simcore.importFontFace({}).catch(() => undefined)
    setImporting(false)
    if (!result) return setImportError('The font could not be imported.')
    if (!result.ok) return setImportError(result.error.message)
    if (result.value) onChoose(result.value.id)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a font"
        className="flex max-h-[80vh] w-[32rem] flex-col overflow-hidden rounded-lg border bg-background text-xs shadow-lg"
      >
        <div className="space-y-2 border-b p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Choose a font</h2>
            <p className="text-muted-foreground">
              {footprint.families} of {MAXIMUM_FONT_FAMILIES} families ·{' '}
              {kilobytes(footprint.bytes)} of 2 MiB
            </p>
          </div>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search fonts"
            className="h-8 w-full rounded-md border bg-background px-2 text-foreground"
          />
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <Group title="In this dashboard" hint="Already used, so it costs no slot.">
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
          <Group title="Library" hint="Bundled with the app, imported, or downloaded.">
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
            title="Google Fonts"
            hint={
              needle
                ? 'Downloaded when you pick a weight.'
                : `Most used first — search to reach the rest of the ${catalog.length}.`
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
                    ? 'Downloading…'
                    : budgetSpent
                      ? `The board holds ${MAXIMUM_FONT_FAMILIES} font families at a time.`
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
              Nothing matches “{query}”. Import a file to add your own.
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t p-3">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {importError ?? 'A weight is its own font here, because the board holds one face per family.'}
          </span>
          <Button variant="outline" disabled={importing} onClick={() => void importFace()}>
            {importing ? 'Importing…' : 'Import font…'}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
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
