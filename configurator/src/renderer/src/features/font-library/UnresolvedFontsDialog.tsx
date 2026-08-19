import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { useFontLibraryStore } from './font-library-store'

/**
 * The one question a save cannot answer on its own: this dashboard names a
 * family the library has never seen — a document written elsewhere, or a
 * hand-edited one.
 *
 * Nothing has been written to the board when this appears. The board is still
 * running what it was running, and it stays that way until every family
 * resolves: installing half a font package and then a configuration that needs
 * the other half would leave a board the dashboard no longer matches.
 *
 * The imported file lands under exactly the id the document already names, so
 * resolving it here is one file dialog and not a rename.
 */
export function UnresolvedFontsDialog({
  families,
  onRetry,
  onClose
}: {
  families: readonly string[]
  onRetry: () => void
  onClose: () => void
}): React.JSX.Element {
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const refresh = useFontLibraryStore((state) => state.refresh)
  const entries = useFontLibraryStore((state) => state.entries)
  const outstanding = families.filter((family) => !entries.some((entry) => entry.id === family))

  const choose = async (family: string): Promise<void> => {
    setBusy(family)
    setError(undefined)
    const result = await window.simcore.importFontFace({ id: family }).catch(() => undefined)
    setBusy(undefined)
    if (!result) return setError('The font could not be imported.')
    if (!result.ok) return setError(result.error.message)
    await refresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fonts this dashboard needs"
        className="w-[28rem] space-y-3 rounded-lg border bg-background p-4 text-xs shadow-lg"
      >
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Fonts this dashboard needs</h2>
          <p className="text-muted-foreground">
            Nothing was written to the board. It is still running what it was running.
          </p>
        </div>
        <ul className="space-y-1">
          {families.map((family) => {
            const resolved = !outstanding.includes(family)
            return (
              <li
                key={family}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
              >
                <span className={`min-w-0 flex-1 truncate ${resolved ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                  {family}
                </span>
                {resolved ? (
                  <span className="shrink-0 text-emerald-500">Found</span>
                ) : (
                  <Button
                    variant="outline"
                    disabled={busy !== undefined}
                    onClick={() => void choose(family)}
                  >
                    {busy === family ? 'Opening…' : 'Choose .ttf/.otf…'}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
        {error ? <p className="text-red-400">{error}</p> : null}
        <p className="text-muted-foreground">
          Or pick a different font for those widgets in the inspector — anything from the library
          resolves on its own.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button disabled={outstanding.length > 0} onClick={onRetry}>
            Save again
          </Button>
        </div>
      </div>
    </div>
  )
}
