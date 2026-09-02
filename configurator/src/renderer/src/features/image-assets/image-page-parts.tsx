import { MAXIMUM_IMAGE_PACKAGE_SIZE, imageAssetBytes } from '@shared/image-assets'
import { kilobytes } from '@/features/font-library/font-library-store'
import type { ImageEntry } from './image-assets-store'
import { t } from '@shared/ui-text'


export function SizeReadout({ entry }: { entry: ImageEntry }): React.JSX.Element {
  const source = entry.sources[0]
  const frames = entry.sources.length
  const bytes = imageAssetBytes(entry.width, entry.height, entry.format) * frames
  const resized =
    source !== undefined && (source.width !== entry.width || source.height !== entry.height)
  const sourceBytes =
    source === undefined
      ? 0
      : imageAssetBytes(source.width, source.height, entry.format) * frames
  return (
    <p className="text-[11px] text-muted-foreground">
      {frames > 1
        ? t('images.imagePageParts.framesFramesAllConvertedTo', { frames: frames, width: entry.width, height: entry.height })
        : null}
      {source
        ? resized
          ? t('images.imagePageParts.sourceIsWidthHeightConverted', { width: source.width, height: source.height, width2: entry.width, height2: entry.height, bytes: kilobytes(bytes), sourceBytes: kilobytes(sourceBytes) })
          : t('images.imagePageParts.sourceIsWidthHeightUploaded', { width: source.width, height: source.height, bytes: kilobytes(bytes) })
        : null}
    </p>
  )
}

export function Thumbnail({ dataUrl, alt }: { dataUrl?: string; alt: string }): React.JSX.Element {
  return (
    <span
      className="flex size-14 flex-none items-center justify-center overflow-hidden rounded border bg-black/40 p-0.5"
      style={{
        backgroundImage:
          'linear-gradient(45deg, #2a2a2a 25%, transparent 25%, transparent 75%, #2a2a2a 75%), linear-gradient(45deg, #2a2a2a 25%, transparent 25%, transparent 75%, #2a2a2a 75%)',
        backgroundSize: '10px 10px',
        backgroundPosition: '0 0, 5px 5px'
      }}
    >
      {dataUrl ? (
        <img alt={alt} src={dataUrl} className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-[10px] text-muted-foreground">{t('images.imagePageParts.noCopy')}</span>
      )}
    </span>
  )
}

export function StorageBar({
  label,
  used,
  available,
  over,
  className
}: {
  label: string
  used: number
  available: boolean
  over?: boolean
  className?: string
}): React.JSX.Element {
  const percent = Math.min(100, Math.round((used / MAXIMUM_IMAGE_PACKAGE_SIZE) * 100))
  const free = Math.max(0, MAXIMUM_IMAGE_PACKAGE_SIZE - used)
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={over ? 'text-red-400' : 'text-muted-foreground'}>
          {available
            ? `${kilobytes(used)} of ${kilobytes(MAXIMUM_IMAGE_PACKAGE_SIZE)} · ${
                over ? `${kilobytes(used - MAXIMUM_IMAGE_PACKAGE_SIZE)} over` : `${kilobytes(free)} free`
              }`
            : t('images.imagePageParts.unavailable')}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-[width] ${over ? 'bg-red-500' : 'bg-sky-500'}`}
          style={{ width: `${available ? Math.max(percent, used > 0 ? 1 : 0) : 0}%` }}
        />
      </div>
    </div>
  )
}
