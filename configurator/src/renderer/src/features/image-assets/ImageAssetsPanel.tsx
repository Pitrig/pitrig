import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

export function ImageAssetsPanel(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const entries = useImageAssetsStore((state) => state.entries)
  const progress = useImageAssetsStore((state) => state.progress)
  const error = useImageAssetsStore((state) => state.error)
  const running = useImageAssetsStore((state) => state.operationStartedAt !== undefined)
  const store = useImageAssetsStore
  const [busy, setBusy] = useState(false)

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

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle>Images</CardTitle>
        <CardDescription>
          {images
            ? 'Converted here and stored on the board as one package. Installing replaces every image and needs a restart.'
            : 'The connected firmware does not support uploaded images.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 text-xs">
        {installed.length > 0 ? (
          <div className="space-y-1 rounded-md border bg-muted/20 p-2">
            {installed.map((image) => (
              <div key={image.name} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{image.name}</span>
                <span className="flex-none text-muted-foreground">
                  {`${image.width}×${image.height} · ${image.format}`}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">
            {images ? 'No images installed.' : 'Connect a board with image support.'}
          </p>
        )}

        {entries.map((entry) => (
          <div key={entry.source.id} className="space-y-1 rounded-md border p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate" title={entry.source.name}>
                {entry.source.name}
              </span>
              <button
                type="button"
                className="flex-none rounded-md border px-2 py-0.5"
                onClick={() => store.getState().removeEntry(entry.source.id)}
              >
                Remove
              </button>
            </div>
            <label className="grid gap-1">
              <span className="text-muted-foreground">Name a widget refers to</span>
              <input
                value={entry.name}
                maxLength={31}
                className="h-7 rounded-md border bg-transparent px-1"
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
                  store
                    .getState()
                    .updateEntry(entry.source.id, {
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
            <p className="text-muted-foreground">
              {`Source is ${entry.source.width}×${entry.source.height}. The board draws the image at the size it is uploaded at, so this is also the widget's size.`}
            </p>
          </div>
        ))}

        {invalid.length > 0 ? (
          <p className="text-amber-400">
            A name uses lower case letters, digits, dash and underscore, up to 31 characters.
          </p>
        ) : null}
        {duplicated ? <p className="text-amber-400">Two images share a name.</p> : null}
        {images?.rebootRequired ? (
          <p className="text-amber-400">Restart the board before uploading again.</p>
        ) : null}
        {progress ? (
          <p className="text-muted-foreground">
            {`${progress.message}${progress.total > 0 ? ` (${Math.round((progress.completed / progress.total) * 100)}%)` : ''}`}
          </p>
        ) : null}
        {error ? <p className="text-red-400">{error}</p> : null}

        <div className="flex gap-2">
          <Button
            className="flex-1"
            variant="outline"
            disabled={busy || !images || entries.length >= MAXIMUM_IMAGES}
            onClick={() => void addSource()}
          >
            Add image
          </Button>
          <Button className="flex-1" disabled={!uploadable} onClick={() => void upload()}>
            {running ? 'Uploading…' : 'Install'}
          </Button>
        </div>
        {running ? (
          <Button
            className="w-full"
            variant="outline"
            onClick={() => void window.simcore.cancelImageUpload()}
          >
            Cancel
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
