import { Trash2, Type } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CatalogSection } from './CatalogSection'

import { MAXIMUM_FONT_FAMILIES } from '@shared/font-assets'
import { documentFonts } from '@shared/document-fonts'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, PageSection, PageShell } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { DigitSpecimen } from './DigitSpecimen'
import { useFontFaceStore, previewFontFamily } from './font-face-store'
import {
  dashboardFontFootprint,
  findFontEntry,
  kilobytes,
  useFontLibraryStore
} from './font-library-store'

export function FontsPage(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draft = useDeviceStore((state) => state.draft)
  const entries = useFontLibraryStore((state) => state.entries)
  const unreadable = useFontLibraryStore((state) => state.unreadable)
  const loaded = useFontFaceStore((state) => state.loaded)
  const ensureFaces = useFontFaceStore((state) => state.ensureFaces)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    void ensureFaces(entries.map((entry) => entry.id))
  }, [ensureFaces, entries])

  const used = useMemo(
    () =>
      [
        ...new Set(
          documentFonts(draft)
            .map((font) => font?.family)
            .filter((family): family is string => Boolean(family))
        )
      ].sort(),
    [draft]
  )
  const footprint = dashboardFontFootprint(entries, used)
  const installed = session?.fontAssets?.families ?? []
  const unresolved = used.filter((family) => !findFontEntry(entries, family))

  const importFace = async (): Promise<void> => {
    setBusy(true)
    setMessage(undefined)
    const result = await window.simcore.importFontFace({}).catch(() => undefined)
    setBusy(false)
    if (!result) return setMessage('The font could not be imported.')
    if (!result.ok) return setMessage(result.error.message)
    if (result.value) setMessage(`Imported ${result.value.name}.`)
  }

  const removeFace = async (id: string, name: string): Promise<void> => {
    if (used.includes(id)) {
      setMessage(`${name} is used by this dashboard. Change those widgets first.`)
      return
    }
    if (!window.confirm(`Remove ${name} from the library?`)) return
    setBusy(true)
    setMessage(undefined)
    const result = await window.simcore.removeFontFace({ id }).catch(() => undefined)
    setBusy(false)
    if (!result) return setMessage('The face could not be removed.')
    setMessage(result.ok ? `${name} removed from the library.` : result.error.message)
  }

  const clearBoard = async (): Promise<void> => {
    if (!window.confirm('Erase the font package installed on the board?')) return
    setBusy(true)
    setMessage(undefined)
    const result = await window.simcore.clearFontAssets().catch(() => undefined)
    setBusy(false)
    if (!result) return setMessage('The board could not be reached.')
    setMessage(
      result.ok
        ? 'Board font package erased. Restart the board, then save to reinstall.'
        : result.error.message
    )
  }

  return (
    <PageShell
      title="Fonts"
      description={`${footprint.families} of ${MAXIMUM_FONT_FAMILIES} families · ${kilobytes(footprint.bytes)} of 2 MiB. A size never needs an upload — the board rasterizes every size from the installed face.`}
      actions={
        <>
          <Button variant="outline" disabled={busy} onClick={() => void importFace()}>
            Import font…
          </Button>
          <Button
            className="text-red-400 hover:text-red-300"
            variant="outline"
            disabled={busy || !session?.fontAssets?.storageAvailable}
            title="Erase the package installed on the connected board"
            onClick={() => void clearBoard()}
          >
            Erase on board
          </Button>
        </>
      }
    >
      {message ? (
        <p className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">{message}</p>
      ) : null}

      <PageSection
        title="Used by this dashboard"
        description="Fonts install themselves when you save to the board."
      >
        {used.length === 0 ? (
          <EmptyState icon={<Type aria-hidden="true" className="size-6" />} title="No fonts named">
            Every text widget carries a family and a size. Pick one in the inspector and it appears
            here.
          </EmptyState>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {used.map((family) => {
              const entry = findFontEntry(entries, family)
              return (
                <li
                  key={family}
                  className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-foreground"
                      style={loaded[family] ? { fontFamily: previewFontFamily(family) } : undefined}
                    >
                      {entry?.name ?? family}
                    </span>
                    <DigitSpecimen
                      cssFamily={loaded[family] ? previewFontFamily(family) : undefined}
                      tabularDigits={entry?.tabularDigits}
                    />
                  </span>
                  {!entry ? (
                    <Badge variant="outline" className="border-amber-500 text-amber-500">
                      Not in library
                    </Badge>
                  ) : installed.includes(family) ? (
                    <Badge variant="outline" className="border-emerald-600 text-emerald-500">
                      On board
                    </Badge>
                  ) : (
                    <Badge variant="outline">Installs on save</Badge>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {unresolved.length > 0 ? (
          <p className="mt-3 text-amber-400">
            {unresolved.length === 1 ? 'One family is' : `${unresolved.length} families are`} not in
            the library. Import the face, or pick another font in the inspector — saving stops until
            every family resolves.
          </p>
        ) : null}
        {unreadable > 0 ? (
          <p className="mt-2 text-amber-400">
            {unreadable} library {unreadable === 1 ? 'entry has' : 'entries have'} lost their face
            file.
          </p>
        ) : null}
      </PageSection>

      <PageSection
        title="Library"
        description="Faces this application can install. A weight is its own entry, because the board holds one face per family."
      >
        {entries.length === 0 ? (
          <EmptyState title="The library is empty">
            Import a TTF or OTF file, or add one from Google Fonts below.
          </EmptyState>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-foreground"
                    style={
                      loaded[entry.id] ? { fontFamily: previewFontFamily(entry.id) } : undefined
                    }
                    title={entry.id}
                  >
                    {entry.name}
                  </span>
                  <DigitSpecimen
                    cssFamily={loaded[entry.id] ? previewFontFamily(entry.id) : undefined}
                    tabularDigits={entry.tabularDigits}
                  />
                  <span className="block text-[11px] text-muted-foreground">
                    {`${entry.origin} · ${kilobytes(entry.bytes)}${used.includes(entry.id) ? ' · in use' : ''}`}
                  </span>
                </span>
                {entry.origin === 'bundled' ? (
                  <Badge variant="outline">Bundled</Badge>
                ) : (
                  <Button
                    aria-label={`Remove ${entry.name}`}
                    className="flex-none px-2 text-red-400 hover:text-red-300"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void removeFace(entry.id, entry.name)}
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      <CatalogSection onMessage={setMessage} />
    </PageShell>
  )
}
