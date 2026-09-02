import { Image as ImageIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { EmptyState, PageSection, PageShell } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import {
  IMAGE_ID_PATTERN,
  MAXIMUM_IMAGES,
  MAXIMUM_IMAGE_DIMENSION,
  MAXIMUM_IMAGE_PACKAGE_SIZE,
  imagePackageSize
} from '@shared/image-assets'
import { usePreviewAssetStore } from '@/features/configuration/preview/preview-assets'
import { useImageAssetsStore } from './image-assets-store'
import { StagedImageCard } from './StagedImageCard'
import { StorageBar, Thumbnail } from './image-page-parts'
import { t } from '@shared/ui-text'

export function ImagesPage(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const entries = useImageAssetsStore((state) => state.entries)
  const progress = useImageAssetsStore((state) => state.progress)
  const error = useImageAssetsStore((state) => state.error)
  const running = useImageAssetsStore((state) => state.operationStartedAt !== undefined)
  const store = useImageAssetsStore
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const installedPreviews = usePreviewAssetStore((state) => state.images)
  const refreshPreviews = usePreviewAssetStore((state) => state.refresh)

  useEffect(() => window.simcore.onImageUploadProgress(store.getState().setProgress), [store])
  useEffect(() => {
    void refreshPreviews()
  }, [refreshPreviews])

  const images = session?.imageAssets
  const installed = images?.images ?? []
  const invalid = entries.filter((entry) => !IMAGE_ID_PATTERN.test(entry.name))
  const duplicated = entries.some(
    (entry, index) => entries.findIndex(({ name }) => name === entry.name) !== index
  )
  const staged = imagePackageSize(
    entries.flatMap((entry) =>
      entry.sources.map(() => ({ width: entry.width, height: entry.height, format: entry.format }))
    )
  )
  const oversized = entries.some(
    (entry) =>
      entry.width < 1 ||
      entry.height < 1 ||
      entry.width > MAXIMUM_IMAGE_DIMENSION ||
      entry.height > MAXIMUM_IMAGE_DIMENSION
  )
  const uploadable =
    entries.length > 0 &&
    entries.length <= MAXIMUM_IMAGES &&
    invalid.length === 0 &&
    !duplicated &&
    !oversized &&
    staged <= MAXIMUM_IMAGE_PACKAGE_SIZE &&
    Boolean(images?.storageAvailable) &&
    !images?.rebootRequired &&
    !busy

  const addFrame = async (id: string): Promise<void> => {
    setBusy(true)
    store.getState().setError(undefined)
    try {
      const result = await window.simcore.selectImageSource()
      if (!result.ok) store.getState().setError(result.error.message)
      else if (result.value) store.getState().addFrame(id, result.value)
    } finally {
      setBusy(false)
    }
  }

  const addSource = async (): Promise<void> => {
    setBusy(true)
    store.getState().setError(undefined)
    try {
      const result = await window.simcore.selectImageSource()
      if (!result.ok) store.getState().setError(result.error.message)
      else if (result.value) store.getState().addEntry(result.value)
    } finally {
      setBusy(false)
    }
  }

  const upload = async (): Promise<void> => {
    setBusy(true)
    store.getState().beginOperation()
    try {
      const result = await window.simcore.uploadImageAssets({
        assets: entries.map((entry) => ({
          sourceIds: entry.sources.map((source) => source.id),
          name: entry.name,
          format: entry.format,
          width: entry.width,
          height: entry.height
        }))
      })
      if (!result.ok) store.getState().setError(result.error.message)
    } finally {
      store.getState().endOperation()
      setBusy(false)
    }
  }

  const clearBoard = async (): Promise<void> => {
    if (!window.confirm(t('images.imagesPage.eraseEveryImageInstalledOn'))) return
    setBusy(true)
    setMessage(undefined)
    const result = await window.simcore.clearImageAssets().catch(() => undefined)
    setBusy(false)
    if (!result) return setMessage(t('fonts.fontsPage.theBoardCouldNotBe'))
    setMessage(
      result.ok
        ? t('images.imagesPage.boardImagePackageErasedRestart')
        : result.error.message
    )
  }

  return (
    <PageShell
      title={t('images.imagesPage.images')}
      description={
        images
          ? t('images.imagesPage.convertedHereAndStoredOn')
          : t('images.imagesPage.theConnectedFirmwareDoesNot')
      }
      actions={
        <>
          <Button
            variant="outline"
            disabled={busy || !images || entries.length >= MAXIMUM_IMAGES}
            onClick={() => void addSource()}
          >
            {t('images.imagesPage.addImage')}</Button>
          <Button
            className="text-red-400 hover:text-red-300"
            variant="outline"
            disabled={busy || !images?.storageAvailable || !images?.packageAvailable}
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
        title={t('images.imagesPage.onTheBoard')}
        description={t('images.imagesPage.whatTheInstalledPackageHolds')}
      >
        <StorageBar
          className="mb-3"
          label={t('images.imagesPage.installed')}
          used={images?.packageSize ?? 0}
          available={Boolean(images)}
        />
        {installed.length > 0 ? (
          <ul className="grid gap-1 sm:grid-cols-2">
            {installed.map((image) => (
              <li
                key={image.name}
                className="flex items-center gap-2.5 rounded-md border p-2"
              >
                <Thumbnail
                  dataUrl={installedPreviews[image.name]?.dataUrl}
                  alt={image.name}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono">{image.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {t('images.imagesPage.widthHeightFormat', { width: image.width, height: image.height, format: image.format })}
                    {image.frameCount > 1 ? t('images.imagesPage.frameCountFrames', { frameCount: image.frameCount }) : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<ImageIcon aria-hidden="true" className="size-6" />}
            title={images ? t('images.imagesPage.noImagesInstalled') : t('images.imagesPage.noImageSupport')}
          >
            {images
              ? t('images.imagesPage.addAPngOrJpeg')
              : t('images.imagesPage.connectABoardWhoseFirmware')}
          </EmptyState>
        )}
        {images?.rebootRequired ? (
          <p className="mt-3 text-amber-400">{t('images.imagesPage.restartTheBoardBeforeUploading')}</p>
        ) : null}
      </PageSection>

      <PageSection
        title={t('images.imagesPage.readyToInstall')}
        description={t('images.imagesPage.theWholePackageIsReplaced')}
        actions={
          <>
            <Button disabled={!uploadable} onClick={() => void upload()}>
              {running ? t('images.imagesPage.uploading') : `Install ${entries.length || ''}`.trim()}
            </Button>
            {running ? (
              <Button variant="outline" onClick={() => void window.simcore.cancelImageUpload()}>
                {t('common.cancel')}</Button>
            ) : null}
          </>
        }
      >
        {entries.length > 0 ? (
          <StorageBar
            className="mb-3"
            label={t('images.imagesPage.thisSelection')}
            used={staged}
            available
            over={staged > MAXIMUM_IMAGE_PACKAGE_SIZE}
          />
        ) : null}
        {entries.length === 0 ? (
          <EmptyState title={t('images.imagesPage.nothingStaged')}>
            {t('images.imagesPage.addingAnImageConvertsIt')}</EmptyState>
        ) : (
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
        )}

        {invalid.length > 0 ? (
          <p className="mt-3 text-amber-400">
            {t('images.imagesPage.aNameUsesLowerCase')}</p>
        ) : null}
        {duplicated ? <p className="mt-2 text-amber-400">{t('images.imagesPage.twoImagesShareAName')}</p> : null}
        {progress ? (
          <p className="mt-3 text-muted-foreground">
            {`${progress.message}${progress.total > 0 ? ` (${Math.round((progress.completed / progress.total) * 100)}%)` : ''}`}
          </p>
        ) : null}
        {error ? <p className="mt-2 text-red-400">{error}</p> : null}
      </PageSection>
    </PageShell>
  )
}
