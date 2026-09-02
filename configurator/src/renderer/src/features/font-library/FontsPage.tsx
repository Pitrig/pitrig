import { Trash2, Type } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CatalogSection } from './CatalogSection'

import { MAXIMUM_FONT_FAMILIES } from '@shared/font-assets'
import { documentFonts } from '@shared/document-fonts'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, PageSection, PageShell } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { FaceSpecimen } from './FaceSpecimen'
import { isIconFace } from './icon-face'
import { useFontFaceStore, previewFontFamily } from './font-face-store'
import {
  dashboardFontFootprint,
  findFontEntry,
  kilobytes,
  useFontLibraryStore
} from './font-library-store'
import { t } from '@shared/ui-text'

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
    if (!result) return setMessage(t('fonts.fontsPage.theFontCouldNotBe'))
    if (!result.ok) return setMessage(result.error.message)
    if (result.value) setMessage(t('fonts.fontsPage.importedName', { name: result.value.name }))
  }

  const removeFace = async (id: string, name: string): Promise<void> => {
    if (used.includes(id)) {
      setMessage(t('fonts.fontsPage.nameIsUsedByThis', { name: name }))
      return
    }
    if (!window.confirm(t('fonts.fontsPage.removeNameFromTheLibrary', { name: name }))) return
    setBusy(true)
    setMessage(undefined)
    const result = await window.simcore.removeFontFace({ id }).catch(() => undefined)
    setBusy(false)
    if (!result) return setMessage(t('fonts.fontsPage.theFaceCouldNotBe'))
    setMessage(result.ok ? t('fonts.fontsPage.nameRemovedFromTheLibrary', { name: name }) : result.error.message)
  }

  const clearBoard = async (): Promise<void> => {
    if (!window.confirm(t('fonts.fontsPage.eraseTheFontPackageInstalled'))) return
    setBusy(true)
    setMessage(undefined)
    const result = await window.simcore.clearFontAssets().catch(() => undefined)
    setBusy(false)
    if (!result) return setMessage(t('fonts.fontsPage.theBoardCouldNotBe'))
    setMessage(
      result.ok
        ? t('fonts.fontsPage.boardFontPackageErasedRestart')
        : result.error.message
    )
  }

  return (
    <PageShell
      title={t('fonts.fontsPage.fonts')}
      description={t('fonts.fontsPage.familiesOfMaximumFontFamilies', { families: footprint.families, mAXIMUM_FONT_FAMILIES: MAXIMUM_FONT_FAMILIES, bytes: kilobytes(footprint.bytes) })}
      actions={
        <>
          <Button variant="outline" disabled={busy} onClick={() => void importFace()}>
            {t('fonts.fontsPage.importFont')}</Button>
          <Button
            className="text-red-400 hover:text-red-300"
            variant="outline"
            disabled={busy || !session?.fontAssets?.storageAvailable}
            title={t('fonts.fontsPage.eraseThePackageInstalledOn')}
            onClick={() => void clearBoard()}
          >
            {t('fonts.fontsPage.eraseOnBoard')}</Button>
        </>
      }
    >
      {message ? (
        <p className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">{message}</p>
      ) : null}

      <PageSection
        title={t('fonts.fontsPage.usedByThisDashboard')}
        description={t('fonts.fontsPage.fontsInstallThemselvesWhenYou')}
      >
        {used.length === 0 ? (
          <EmptyState icon={<Type aria-hidden="true" className="size-6" />} title={t('fonts.fontsPage.noFontsNamed')}>
            {t('fonts.fontsPage.everyTextWidgetCarriesA')}</EmptyState>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {used.map((family) => {
              const entry = findFontEntry(entries, family)
              const icons = isIconFace(family, entry?.category)
              return (
                <li
                  key={family}
                  className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-foreground"
                      style={
                        loaded[family] && !icons
                          ? { fontFamily: previewFontFamily(family) }
                          : undefined
                      }
                    >
                      {entry?.name ?? family}
                    </span>
                    <FaceSpecimen
                      cssFamily={loaded[family] ? previewFontFamily(family) : undefined}
                      tabularDigits={icons ? undefined : entry?.tabularDigits}
                      icons={icons}
                    />
                  </span>
                  {!entry ? (
                    <Badge variant="outline" className="border-amber-500 text-amber-500">
                      {t('fonts.fontsPage.notInLibrary')}</Badge>
                  ) : installed.includes(family) ? (
                    <Badge variant="outline" className="border-emerald-600 text-emerald-500">
                      {t('fonts.fontsPage.onBoard')}</Badge>
                  ) : (
                    <Badge variant="outline">{t('fonts.fontsPage.installsOnSave')}</Badge>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {unresolved.length > 0 ? (
          <p className="mt-3 text-amber-400">
            {t('fonts.fontsPage.unresolvedFamilies', { count: unresolved.length })}
          </p>
        ) : null}
        {unreadable > 0 ? (
          <p className="mt-2 text-amber-400">
            {t('fonts.fontsPage.unreadableEntries', { count: unreadable })}
          </p>
        ) : null}
      </PageSection>

      <PageSection
        title={t('fonts.fontPicker.library')}
        description={t('fonts.fontsPage.facesThisApplicationCanInstall')}
      >
        {entries.length === 0 ? (
          <EmptyState title={t('fonts.fontsPage.theLibraryIsEmpty')}>
            {t('fonts.fontsPage.importATtfOrOtf')}</EmptyState>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {entries.map((entry) => {
              const icons = isIconFace(entry.id, entry.category)
              return (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-foreground"
                    style={
                      loaded[entry.id] && !icons
                        ? { fontFamily: previewFontFamily(entry.id) }
                        : undefined
                    }
                    title={entry.id}
                  >
                    {entry.name}
                  </span>
                  <FaceSpecimen
                    cssFamily={loaded[entry.id] ? previewFontFamily(entry.id) : undefined}
                    tabularDigits={icons ? undefined : entry.tabularDigits}
                    icons={icons}
                  />
                  <span className="block text-[11px] text-muted-foreground">
                    {`${entry.origin} · ${kilobytes(entry.bytes)}${used.includes(entry.id) ? ' · in use' : ''}`}
                  </span>
                </span>
                {entry.origin === 'bundled' ? (
                  <Badge variant="outline">{t('fonts.fontsPage.bundled')}</Badge>
                ) : (
                  <Button
                    aria-label={t('fonts.fontsPage.removeName', { name: entry.name })}
                    className="flex-none px-2 text-red-400 hover:text-red-300"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void removeFace(entry.id, entry.name)}
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                  </Button>
                )}
              </li>
              )
            })}
          </ul>
        )}
      </PageSection>

      <CatalogSection onMessage={setMessage} />
    </PageShell>
  )
}
