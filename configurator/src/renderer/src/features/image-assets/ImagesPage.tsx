import { Image as ImageIcon, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { EmptyState, PageSection, PageShell } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import {
  IMAGE_ID_PATTERN,
  MAXIMUM_IMAGES,
  MAXIMUM_IMAGE_DIMENSION,
  MAXIMUM_IMAGE_PACKAGE_SIZE,
  imagePackageSize,
  type ImageColorFormat
} from '@shared/image-assets'
import { usePreviewAssetStore } from '@/features/configuration/preview/preview-assets'
import { kilobytes } from '@/features/font-library/font-library-store'
import { useImageAssetsStore } from './image-assets-store'

// Uploaded images, which the device stores as one package and replaces whole.
// The conversion happens in the configurator — the board never decodes — so the
// choices that matter here are the name a widget refers to, the pixel format
// and the size it is drawn at.
const FORMAT_LABELS: Record<ImageColorFormat, string> = {
  rgb565a8: 'Colour + transparency',
  rgb565: 'Colour, no transparency',
  alpha8: 'Mask (alpha only)',
  indexed8: 'Indexed (not supported yet)'
}

export function ImagesPage(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const entries = useImageAssetsStore((state) => state.entries)
  const progress = useImageAssetsStore((state) => state.progress)
  const error = useImageAssetsStore((state) => state.error)
  const running = useImageAssetsStore((state) => state.operationStartedAt !== undefined)
  const store = useImageAssetsStore
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  // The converted bitmaps this application kept when it installed them. The
  // board never sends an image back, so this is the only way to show what it
  // is actually holding — and it is what the canvas draws with too.
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
  // What this selection would occupy once packed — the same layout the
  // converter produces, so the number is the one the device will see.
  const staged = imagePackageSize(entries)
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
          sourceId: entry.source.id,
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
    if (!window.confirm('Erase every image installed on the board?')) return
    setBusy(true)
    setMessage(undefined)
    const result = await window.simcore.clearImageAssets().catch(() => undefined)
    setBusy(false)
    if (!result) return setMessage('The board could not be reached.')
    setMessage(
      result.ok
        ? 'Board image package erased. Restart the board, then install again.'
        : result.error.message
    )
  }

  return (
    <PageShell
      title="Images"
      description={
        images
          ? 'Converted here and stored on the board as one package. Installing replaces every image and needs a restart.'
          : 'The connected firmware does not support uploaded images.'
      }
      actions={
        <>
          <Button
            variant="outline"
            disabled={busy || !images || entries.length >= MAXIMUM_IMAGES}
            onClick={() => void addSource()}
          >
            Add image…
          </Button>
          <Button
            className="text-red-400 hover:text-red-300"
            variant="outline"
            disabled={busy || !images?.storageAvailable || !images?.packageAvailable}
            onClick={() => void clearBoard()}
          >
            Erase on board
          </Button>
        </>
      }
    >
      {message ? (
        <p className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">{message}</p>
      ) : null}

      <PageSection
        title="On the board"
        description="What the installed package holds. A widget refers to one of these names."
      >
        {/* Installing replaces the package whole, so what is staged does not add
            to this — it becomes it. The two bars are two answers to the same
            question, before and after. */}
        <StorageBar
          className="mb-3"
          label="Installed"
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
                    {`${image.width}×${image.height} · ${image.format}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<ImageIcon aria-hidden="true" className="size-6" />}
            title={images ? 'No images installed' : 'No image support'}
          >
            {images
              ? 'Add a PNG or JPEG below, give it the name a widget will refer to, and install.'
              : 'Connect a board whose firmware carries an image partition.'}
          </EmptyState>
        )}
        {images?.rebootRequired ? (
          <p className="mt-3 text-amber-400">Restart the board before uploading again.</p>
        ) : null}
      </PageSection>

      <PageSection
        title="Ready to install"
        description="The whole package is replaced at once, so this list is what the board will hold."
        actions={
          <>
            <Button disabled={!uploadable} onClick={() => void upload()}>
              {running ? 'Uploading…' : `Install ${entries.length || ''}`.trim()}
            </Button>
            {running ? (
              <Button variant="outline" onClick={() => void window.simcore.cancelImageUpload()}>
                Cancel
              </Button>
            ) : null}
          </>
        }
      >
        {entries.length > 0 ? (
          <StorageBar
            className="mb-3"
            label="This selection"
            used={staged}
            available
            over={staged > MAXIMUM_IMAGE_PACKAGE_SIZE}
          />
        ) : null}
        {entries.length === 0 ? (
          <EmptyState title="Nothing staged">
            Adding an image converts it here, at the size the board will draw it — the device
            neither scales nor rotates.
          </EmptyState>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {entries.map((entry) => (
              <div key={entry.source.id} className="space-y-1.5 rounded-md border p-2">
                <div className="flex items-center gap-2.5">
                  <Thumbnail dataUrl={entry.source.dataUrl} alt={entry.source.name} />
                  <span className="min-w-0 flex-1 truncate font-medium" title={entry.source.name}>
                    {entry.source.name}
                  </span>
                  <Button
                    aria-label={`Remove ${entry.source.name}`}
                    className="flex-none px-2"
                    variant="outline"
                    onClick={() => store.getState().removeEntry(entry.source.id)}
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                  </Button>
                </div>
                <label className="grid gap-1">
                  <span className="text-muted-foreground">Name a widget refers to</span>
                  <input
                    value={entry.name}
                    maxLength={31}
                    className="h-7 rounded-md border bg-transparent px-1 font-mono"
                    onChange={(event) =>
                      store.getState().updateEntry(entry.source.id, { name: event.target.value })
                    }
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-muted-foreground">Format</span>
                  <select
                    value={entry.format}
                    className="h-7 rounded-md border bg-transparent px-1"
                    onChange={(event) =>
                      store.getState().updateEntry(entry.source.id, {
                        format: event.target.value as ImageColorFormat
                      })
                    }
                  >
                    {(['rgb565a8', 'rgb565', 'alpha8'] as const).map((format) => (
                      <option key={format} value={format}>
                        {FORMAT_LABELS[format]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1">
                    <span className="text-muted-foreground">Width</span>
                    <input
                      type="number"
                      min={1}
                      max={MAXIMUM_IMAGE_DIMENSION}
                      value={entry.width}
                      className="h-7 rounded-md border bg-transparent px-1"
                      onChange={(event) =>
                        store
                          .getState()
                          .updateEntry(entry.source.id, { width: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-muted-foreground">Height</span>
                    <input
                      type="number"
                      min={1}
                      max={MAXIMUM_IMAGE_DIMENSION}
                      value={entry.height}
                      className="h-7 rounded-md border bg-transparent px-1"
                      onChange={(event) =>
                        store
                          .getState()
                          .updateEntry(entry.source.id, { height: Number(event.target.value) })
                      }
                    />
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {`Source is ${entry.source.width}×${entry.source.height}. The board draws the image at the size it is uploaded at, so this is also the widget's size.`}
                </p>
              </div>
            ))}
          </div>
        )}

        {invalid.length > 0 ? (
          <p className="mt-3 text-amber-400">
            A name uses lower case letters, digits, dash and underscore, up to 31 characters.
          </p>
        ) : null}
        {duplicated ? <p className="mt-2 text-amber-400">Two images share a name.</p> : null}
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


/**
 * One image, at whatever size the row gives it. A bitmap that could not be
 * recovered leaves the box empty rather than the row missing: the board still
 * holds the image, this application simply no longer has its copy.
 */
function Thumbnail({ dataUrl, alt }: { dataUrl?: string; alt: string }): React.JSX.Element {
  return (
    <span
      className="flex size-14 flex-none items-center justify-center overflow-hidden rounded border bg-black/40 p-0.5"
      // The checkerboard is what makes transparency visible as transparency
      // rather than as black, which is what rgb565a8 is chosen for.
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

/**
 * How much of the four megabytes is spoken for. The partition is fixed and the
 * package is replaced whole, so "used" and "left" are the whole story — there
 * is no fragmentation to explain.
 */
function StorageBar({
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
