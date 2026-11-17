import { Image as ImageIcon } from 'lucide-react'

import { EmptyState, PageSection } from '@/app/workspace/PageShell'
import { usePreviewAssetStore } from '@/features/configuration/preview/preview-assets'
import { useDeviceStore } from '@/features/device/device-store'
import { MAXIMUM_IMAGE_PACKAGE_SIZE } from '@shared/image-assets'
import { t } from '@shared/ui-text'
import { StorageBar, Thumbnail } from './image-page-parts'

export function BoardImagesSection(): React.JSX.Element {
  const images = useDeviceStore((state) => state.session?.imageAssets)
  const previews = usePreviewAssetStore((state) => state.images)
  const installed = images?.images ?? []
  return (
    <PageSection
      title={t('images.imagesPage.onTheBoard')}
      description={t('images.imagesPage.whatTheInstalledPackageHolds')}
    >
      <StorageBar
        className="mb-3"
        label={t('images.imagesPage.installed')}
        used={images?.packageSize ?? 0}
        limit={MAXIMUM_IMAGE_PACKAGE_SIZE}
        available={Boolean(images)}
      />
      {installed.length > 0 ? (
        <ul className="grid gap-1 sm:grid-cols-2">
          {installed.map((image) => (
            <li key={image.name} className="flex items-center gap-2.5 rounded-md border p-2">
              <Thumbnail dataUrl={previews[image.name]?.dataUrl} alt={image.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono">{image.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {t('images.imagesPage.widthHeightFormat', {
                    width: image.width,
                    height: image.height,
                    format: image.format
                  })}
                  {image.frameCount > 1
                    ? t('images.imagesPage.frameCountFrames', { frameCount: image.frameCount })
                    : ''}
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
          {images ? t('images.imagesPage.saveInstallsThem') : t('images.imagesPage.connectABoardWhoseFirmware')}
        </EmptyState>
      )}
      {images?.rebootRequired ? (
        <p className="mt-3 text-amber-400">{t('images.imagesPage.restartTheBoardToUse')}</p>
      ) : null}
    </PageSection>
  )
}
