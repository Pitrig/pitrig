import { Image as ImageIcon, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { EmptyState, PageSection, PageShell } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import {
  IMAGE_ID_PATTERN,
  MAXIMUM_IMAGES,
  MAXIMUM_IMAGE_DIMENSION,
  type ImageColorFormat
} from '@shared/image-assets'
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

  useEffect(() => window.simcore.onImageUploadProgress(store.getState().setProgress), [store])

  const images = session?.imageAssets
  const installed = images?.images ?? []
  const invalid = entries.filter((entry) => !IMAGE_ID_PATTERN.test(entry.name))
  const duplicated = entries.some(
    (entry, index) => entries.findIndex(({ name }) => name === entry.name) !== index
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
        {installed.length > 0 ? (
          <ul className="grid gap-1 sm:grid-cols-2">
            {installed.map((image) => (
              <li
                key={image.name}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
              >
                <span className="min-w-0 truncate font-mono">{image.name}</span>
                <span className="flex-none text-muted-foreground">
                  {`${image.width}×${image.height} · ${image.format}`}
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
        {entries.length === 0 ? (
          <EmptyState title="Nothing staged">
            Adding an image converts it here, at the size the board will draw it — the device
            neither scales nor rotates.
          </EmptyState>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {entries.map((entry) => (
              <div key={entry.source.id} className="space-y-1.5 rounded-md border p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium" title={entry.source.name}>
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
