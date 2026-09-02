import { useEffect, useState } from 'react'

import { PageShell } from '@/app/workspace/PageShell'
import { useFontFaceStore } from '@/features/font-library/font-face-store'
import { documentFonts } from '@shared/document-fonts'
import type { DeviceConfiguration } from '@shared/device'
import type { DashboardTemplateSummary, WidgetTemplateSummary } from '@shared/templates'
import { useTemplatesStore } from './templates-store'
import { DashboardSection } from './DashboardSection'
import { WidgetSection } from './WidgetSection'
import { t } from '@shared/ui-text'

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
    if (!window.confirm(t('templates.templatesPage.deleteTheSavedKindName', { kind: entry.kind, name: entry.name }))) return
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const result = await window.simcore.deleteTemplate({ id: entry.id, kind: entry.kind })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setNotice(t('templates.templatesPage.nameDeleted', { name: entry.name }))
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
        <p className="text-xs text-muted-foreground">{t('templates.templatesPage.readingTheLibrary')}</p>
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
