import { MAXIMUM_IMAGE_PACKAGE_SIZE, imageAssetBytes } from '@shared/image-assets'
import { kilobytes } from '@/features/font-library/font-library-store'
import type { ImageEntry } from './image-assets-store'


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
        ? `${frames} frames, all converted to ${entry.width}×${entry.height}. `
        : null}
      {source
        ? resized
          ? `Source is ${source.width}×${source.height}, converted to ${entry.width}×${entry.height} — ${kilobytes(bytes)} instead of ${kilobytes(sourceBytes)}.`
          : `Source is ${source.width}×${source.height}, uploaded unchanged — ${kilobytes(bytes)}. The board draws it at this size, so it is also the widget's size.`
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
        <span className="text-[10px] text-muted-foreground">no copy</span>
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
            : 'Unavailable'}
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
