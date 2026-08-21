import { Link2, Trash2, Unlink2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  MAXIMUM_IMAGE_DIMENSION,
  MAXIMUM_SPRITE_FRAMES,
  type ImageColorFormat
} from '@shared/image-assets'
import { useImageAssetsStore, type ImageEntry } from './image-assets-store'
import { FORMAT_LABELS } from './image-format-labels'
import { SizeReadout, Thumbnail } from './image-page-parts'

/**
 * One staged image: its frames, the name a widget refers to, the format and
 * the size it will be converted at. Everything here edits the staging store;
 * nothing reaches the board until the page installs the package.
 */
export function StagedImageCard({
  entry,
  busy,
  onAddFrame
}: {
  entry: ImageEntry
  busy: boolean
  onAddFrame: (id: string) => void
}): React.JSX.Element {
  const store = useImageAssetsStore
  return (
<div className="space-y-1.5 rounded-md border p-2">
    <div className="flex items-center gap-2.5">
      <Thumbnail dataUrl={entry.sources[0]?.dataUrl} alt={entry.sources[0]?.name ?? ''} />
      <span className="min-w-0 flex-1 truncate font-medium" title={entry.sources[0]?.name}>
        {entry.sources[0]?.name}
      </span>
      <Button
        aria-label={`Remove ${entry.name}`}
        className="flex-none px-2"
        variant="outline"
        onClick={() => store.getState().removeEntry(entry.id)}
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
    {/* Frames beyond the first. A sheet is one entry on the device
        whatever it holds, so this is where an icon set stops
        spending one of the 32 per picture. */}
    {entry.sources.length > 1 ? (
      <ul className="flex flex-wrap gap-1">
        {entry.sources.map((source, index) => (
          <li key={source.id} className="flex items-center gap-1 rounded border px-1 py-0.5">
            <span className="text-[11px] text-muted-foreground">{index}</span>
            <span className="max-w-24 truncate text-[11px]" title={source.name}>
              {source.name}
            </span>
            <button
              aria-label={`Remove frame ${index}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => store.getState().removeFrame(entry.id, source.id)}
            >
              <Trash2 aria-hidden="true" className="size-3" />
            </button>
          </li>
        ))}
      </ul>
    ) : null}
    <Button
      className="w-full"
      variant="outline"
      disabled={busy || entry.sources.length >= MAXIMUM_SPRITE_FRAMES}
      onClick={() => onAddFrame(entry.id)}
    >
      {entry.sources.length > 1
        ? `Add frame (${entry.sources.length})`
        : 'Make a sprite sheet…'}
    </Button>
    <label className="grid gap-1">
      <span className="text-muted-foreground">Name a widget refers to</span>
      <input
        value={entry.name}
        maxLength={31}
        className="h-7 rounded-md border bg-transparent px-1 font-mono"
        onChange={(event) =>
          store.getState().updateEntry(entry.id, { name: event.target.value })
        }
      />
    </label>
    <label className="grid gap-1">
      <span className="text-muted-foreground">Format</span>
      <select
        value={entry.format}
        className="h-7 rounded-md border bg-transparent px-1"
        onChange={(event) =>
          store.getState().updateEntry(entry.id, {
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
    <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-1.5">
      <label className="grid gap-1">
        <span className="text-muted-foreground">Width</span>
        <input
          type="number"
          min={1}
          max={MAXIMUM_IMAGE_DIMENSION}
          value={entry.width}
          className="h-7 w-full rounded-md border bg-transparent px-1"
          onChange={(event) =>
            store.getState().resizeEntry(entry.id, 'width', Number(event.target.value))
          }
        />
      </label>
      {/* Between the two fields, because that is what it relates.
          Shrinking is the usual reason to touch them at all, and
          one side at a time is how an image ends up squashed. */}
      <button
        type="button"
        aria-pressed={entry.lockAspect}
        aria-label={entry.lockAspect ? 'Unlock proportions' : 'Lock proportions'}
        title={
          entry.lockAspect
            ? 'Proportions locked: changing one side carries the other'
            : 'Proportions free: each side is set on its own'
        }
        className={`mb-0.5 rounded-md border p-1.5 ${entry.lockAspect ? 'text-foreground' : 'text-muted-foreground'}`}
        onClick={() =>
          store.getState().updateEntry(entry.id, { lockAspect: !entry.lockAspect })
        }
      >
        {entry.lockAspect ? (
          <Link2 aria-hidden="true" className="size-3.5" />
        ) : (
          <Unlink2 aria-hidden="true" className="size-3.5" />
        )}
      </button>
      <label className="grid gap-1">
        <span className="text-muted-foreground">Height</span>
        <input
          type="number"
          min={1}
          max={MAXIMUM_IMAGE_DIMENSION}
          value={entry.height}
          className="h-7 w-full rounded-md border bg-transparent px-1"
          onChange={(event) =>
            store.getState().resizeEntry(entry.id, 'height', Number(event.target.value))
          }
        />
      </label>
    </div>
    {/* What the two numbers above actually cost. The board draws
        an image at the size it was uploaded at, so this size is
        also the widget's — and the memory it takes is quadratic in
        it, which is the one thing worth seeing while typing. */}
    <SizeReadout entry={entry} />
  </div>
  )
}
