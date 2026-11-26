import { useEffect, useState } from 'react'

import { PageShell } from '@/app/workspace/PageShell'
import { Button } from '@/components/ui/button'
import { confirmAction } from '@/components/ui/confirm-store'
import { usePreviewAssetStore } from '@/features/configuration/preview/preview-assets'
import { useBoardActivityReason } from '@/features/device/board-activity'
import { useDeviceStore } from '@/features/device/device-store'
import { newerDocumentsReason } from '@shared/newer-documents'
import { t } from '@shared/ui-text'
import { BoardImagesSection } from './BoardImagesSection'
import { useImageAssetsStore } from './image-assets-store'
import { LibraryImagesSection, type PageMessage } from './LibraryImagesSection'
import { StagedImagesSection } from './StagedImagesSection'

export function ImagesPage(): React.JSX.Element {
  const images = useDeviceStore((state) => state.session?.imageAssets)
  const refreshPreviews = usePreviewAssetStore((state) => state.refresh)
  const [busy, setBusy] = useState(false)
  const busyReason = useBoardActivityReason()
  const newer = useDeviceStore((state) => newerDocumentsReason(state.session))
  const eraseBlocked = busyReason ?? newer
  const [message, setMessage] = useState<PageMessage>()

  useEffect(() => {
    void refreshPreviews()
  }, [refreshPreviews])

  const addSource = async (): Promise<void> => {
    setBusy(true)
    setMessage(undefined)
    try {
      const result = await window.pitrig.selectImageSource()
      if (!result.ok) setMessage({ kind: 'error', text: result.error.message })
      else if (result.value) useImageAssetsStore.getState().addEntry(result.value)
    } finally {
      setBusy(false)
    }
  }

  const clearBoard = async (): Promise<void> => {
    if (!(await confirmAction(t('images.imagesPage.eraseEveryImageInstalledOn'), { danger: true }))) return
    setBusy(true)
    setMessage(undefined)
    const result = await window.pitrig.clearImageAssets().catch(() => undefined)
    setBusy(false)
    if (!result) return setMessage({ kind: 'error', text: t('fonts.fontsPage.theBoardCouldNotBe') })
    setMessage(
      result.ok
        ? { kind: 'success', text: t('images.imagesPage.boardImagePackageErasedRestart') }
        : { kind: 'error', text: result.error.message }
    )
  }

  return (
    <PageShell
      title={t('images.imagesPage.images')}
      description={t('images.imagesPage.description')}
      actions={
        <>
          <Button variant="outline" disabled={busy} onClick={() => void addSource()}>
            {t('images.imagesPage.addImage')}
          </Button>
          <Button
            className="text-red-400 hover:text-red-300"
            variant="outline"
            disabled={
              busy ||
              eraseBlocked !== undefined ||
              !images?.storageAvailable ||
              !images?.packageAvailable
            }
            title={eraseBlocked}
            onClick={() => void clearBoard()}
          >
            {t('fonts.fontsPage.eraseOnBoard')}
          </Button>
        </>
      }
    >
      {message ? (
        <p
          className={
            message.kind === 'error'
              ? 'rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300'
              : 'rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground'
          }
        >
          {message.text}
        </p>
      ) : null}
      <StagedImagesSection busy={busy} setBusy={setBusy} onMessage={setMessage} />
      <LibraryImagesSection busy={busy} onMessage={setMessage} />
      <BoardImagesSection />
    </PageShell>
  )
}
