import { useMemo, useState } from 'react'

import { MAXIMUM_FONT_FAMILIES } from '@shared/font-assets'
import { documentFonts } from '@shared/document-fonts'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDeviceStore } from '@/features/device/device-store'
import { useFontFaceStore, previewFontFamily } from './font-face-store'
import {
  dashboardFontFootprint,
  findFontEntry,
  kilobytes,
  useFontLibraryStore
} from './font-library-store'

/**
 * The fonts this dashboard uses, and what the board has been given so far.
 *
 * Choosing a font happens in the inspector and delivering one happens on save,
 * so this is neither of those: it is where the author sees the eight-family
 * budget being spent, notices a family the library cannot answer for, imports a
 * file, and — when something has gone wrong — reaches the manual controls the
 * automatic path replaced.
 */
export function FontLibraryPanel(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draft = useDeviceStore((state) => state.draft)
  const entries = useFontLibraryStore((state) => state.entries)
  const unreadable = useFontLibraryStore((state) => state.unreadable)
  const loaded = useFontFaceStore((state) => state.loaded)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

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

  const clear = async (): Promise<void> => {
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
    <Card>
      <CardHeader>
        <CardTitle>Fonts</CardTitle>
        <CardDescription>
          {footprint.families} of {MAXIMUM_FONT_FAMILIES} families ·{' '}
          {kilobytes(footprint.bytes)} of 2 MiB
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-[11px]">
        {used.length === 0 ? (
          <p className="rounded-md border p-2 text-muted-foreground">
            This dashboard names no fonts yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {used.map((family) => {
              const entry = findFontEntry(entries, family)
              return (
                <li
                  key={family}
                  className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                >
                  <span
                    className="min-w-0 flex-1 truncate text-foreground"
                    style={loaded[family] ? { fontFamily: previewFontFamily(family) } : undefined}
                  >
                    {entry?.name ?? family}
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
          <p className="text-amber-400">
            {unresolved.length === 1 ? 'One family is' : `${unresolved.length} families are`} not in
            the library. Import the face, or pick another font in the inspector — saving stops until
            every family resolves.
          </p>
        ) : null}
        {unreadable > 0 ? (
          <p className="text-amber-400">
            {unreadable} library {unreadable === 1 ? 'entry has' : 'entries have'} lost their face
            file.
          </p>
        ) : null}

        <p className="text-muted-foreground">
          Fonts install themselves when you save to the board. A size never needs an upload — the
          board rasterizes every size from the installed face.
        </p>

        {message ? <p className="text-muted-foreground">{message}</p> : null}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => void importFace()}>
            Import font…
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy || !session?.fontAssets?.storageAvailable}
            onClick={() => void clear()}
          >
            Erase on board
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
