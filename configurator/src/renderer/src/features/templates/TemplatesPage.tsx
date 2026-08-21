import { useEffect, useState } from 'react'

import { PageShell } from '@/app/workspace/PageShell'
import { useFontFaceStore } from '@/features/font-library/font-face-store'
import { documentFonts } from '@shared/document-fonts'
import type { DeviceConfiguration } from '@shared/device'
import type { DashboardTemplateSummary, WidgetTemplateSummary } from '@shared/templates'
import { useTemplatesStore } from './templates-store'
import { DashboardSection } from './DashboardSection'
import { WidgetSection } from './WidgetSection'

/**
 * The library, in two halves.
 *
 * A **dashboard** answers "what am I starting from" — it replaces the whole
 * draft, and one authored for another display is scaled to the board in hand on
 * the way in, by the same engine the Configs page's Convert uses. A **widget**
 * answers "what am I building with" — it is placed onto the dashboard already
 * open, and changes nothing else about it.
 *
 * Neither is saved from here any more: saving is an act on what is on the
 * canvas, so it lives beside Save to board where the canvas is.
 */
export function TemplatesPage(): React.JSX.Element {
  const library = useTemplatesStore((state) => state.library)
  const loading = useTemplatesStore((state) => state.loading)
  const error = useTemplatesStore((state) => state.error)
  const setError = useTemplatesStore((state) => state.setError)
  const refresh = useTemplatesStore((state) => state.refresh)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Every card draws itself, so the faces the library names have to be loaded —
  // the canvas only ever asks for the ones the open document uses. Both halves
  // count: the widget entries, which arrive with the listing, and whichever
  // dashboards have been read for their preview.
  const ensureFaces = useFontFaceStore((state) => state.ensureFaces)
  const documents = useTemplatesStore((state) => state.documents)
  const entryFamilies = [
    ...(library?.widgets ?? []).map(
      (entry) =>
        ({ dashboard: { screens: [{ widgets: [entry.widget] }] } }) as DeviceConfiguration
    ),
    ...Object.values(documents).filter(
      (document): document is DeviceConfiguration => typeof document === 'object'
    )
  ]
    .flatMap((document) => documentFonts(document))
    .map((font) => font?.family)
    .filter((family): family is string => Boolean(family))
  const familyKey = [...new Set(entryFamilies)].sort().join(' ')
  useEffect(() => {
    void ensureFaces(familyKey ? familyKey.split(' ') : [])
  }, [ensureFaces, familyKey])

  const remove = async (
    entry: DashboardTemplateSummary | WidgetTemplateSummary
  ): Promise<void> => {
    if (!window.confirm(`Delete the saved ${entry.kind} "${entry.name}"?`)) return
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const result = await window.simcore.deleteTemplate({ id: entry.id, kind: entry.kind })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setNotice(`"${entry.name}" deleted.`)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell>
      <DashboardSection
        busy={busy}
        setBusy={setBusy}
        onNotice={setNotice}
        onDelete={(entry) => void remove(entry)}
      />
      <WidgetSection busy={busy} onDelete={(entry) => void remove(entry)} />

      {loading && !library ? (
        <p className="text-xs text-muted-foreground">Reading the library…</p>
      ) : null}
      {library && library.unreadable > 0 ? (
        <p className="text-[11px] text-amber-400">
          {`${library.unreadable} file${library.unreadable === 1 ? '' : 's'} in the template folder could not be read.`}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300">
          {notice}
        </p>
      ) : null}
    </PageShell>
  )
}
