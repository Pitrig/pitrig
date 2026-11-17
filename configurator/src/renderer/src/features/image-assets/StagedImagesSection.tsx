import { PageSection } from '@/app/workspace/PageShell'
import { Button } from '@/components/ui/button'
import { confirmAction } from '@/components/ui/confirm-store'
import { IMAGE_ID_PATTERN, MAXIMUM_IMAGE_DIMENSION } from '@shared/image-assets'
import { t } from '@shared/ui-text'
import { useImageAssetsStore } from './image-assets-store'
import { useImageLibraryStore } from './image-library-store'
import type { PageMessage } from './LibraryImagesSection'
import { StagedImageCard } from './StagedImageCard'

export function StagedImagesSection({
  busy,
  setBusy,
  onMessage
}: {
  busy: boolean
  setBusy: (busy: boolean) => void
  onMessage: (message: PageMessage | undefined) => void
}): React.JSX.Element | null {
  const entries = useImageAssetsStore((state) => state.entries)
  const library = useImageLibraryStore((state) => state.snapshot.entries)
  const invalid = entries.filter((entry) => !IMAGE_ID_PATTERN.test(entry.name))
  const duplicated = entries.some(
    (entry, index) => entries.findIndex(({ name }) => name === entry.name) !== index
  )
  const oversized = entries.filter(
    (entry) =>
      entry.width < 1 ||
      entry.height < 1 ||
      entry.width > MAXIMUM_IMAGE_DIMENSION ||
      entry.height > MAXIMUM_IMAGE_DIMENSION
  )
  const addable =
    entries.length > 0 && invalid.length === 0 && !duplicated && oversized.length === 0 && !busy

  const addFrame = async (id: string): Promise<void> => {
    setBusy(true)
    onMessage(undefined)
    try {
      const result = await window.pitrig.selectImageSource()
      if (!result.ok) onMessage({ kind: 'error', text: result.error.message })
      else if (result.value) useImageAssetsStore.getState().addFrame(id, result.value)
    } finally {
      setBusy(false)
    }
  }

  const add = async (): Promise<void> => {
    const replacing = entries
      .filter((entry) => library.some(({ id }) => id === entry.name))
      .map((entry) => entry.name)
    if (
      replacing.length > 0 &&
      !(await confirmAction(t('images.staged.replace', { images: replacing.join(', ') })))
    ) {
      return
    }
    setBusy(true)
    onMessage(undefined)
    try {
      const result = await window.pitrig.addImagesToLibrary({
        assets: entries.map((entry) => ({
          sourceIds: entry.sources.map((source) => source.id),
          name: entry.name,
          format: entry.format,
          width: entry.width,
          height: entry.height
        }))
      })
      if (!result.ok) {
        onMessage({ kind: 'error', text: result.error.message })
        return
      }
      const store = useImageAssetsStore.getState()
      for (const entry of entries) store.removeEntry(entry.id)
      onMessage({ kind: 'success', text: t('images.staged.added', { count: result.value.length }) })
    } catch (error) {
      onMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : t('images.imageLibrary.notAdded')
      })
    } finally {
      setBusy(false)
    }
  }

  if (entries.length === 0) return null
  return (
    <PageSection
      title={t('images.staged.title')}
      description={t('images.imagesPage.addingAnImageConvertsIt')}
      actions={
        <Button disabled={!addable} onClick={() => void add()}>
          {t('images.staged.add', { count: entries.length })}
        </Button>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {entries.map((entry) => (
          <StagedImageCard
            key={entry.id}
            entry={entry}
            busy={busy}
            onAddFrame={(id) => void addFrame(id)}
          />
        ))}
      </div>
      {invalid.length > 0 ? (
        <p className="mt-3 text-amber-400">{t('images.imagesPage.aNameUsesLowerCase')}</p>
      ) : null}
      {duplicated ? <p className="mt-2 text-amber-400">{t('images.imagesPage.twoImagesShareAName')}</p> : null}
      {oversized.map((entry) => (
        <p key={entry.id} className="mt-2 text-amber-400">
          {t('images.imagePackage.nameIsWidthHeightThe', {
            name: entry.name,
            width: entry.width,
            height: entry.height,
            mAXIMUM_IMAGE_DIMENSION: MAXIMUM_IMAGE_DIMENSION
          })}
        </p>
      ))}
    </PageSection>
  )
}
