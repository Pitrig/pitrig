import { Link2, Trash2, Unlink2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  MAXIMUM_IMAGE_DIMENSION,
  MAXIMUM_SPRITE_FRAMES,
  type ImageColorFormat
} from '@shared/image-assets'
import { t } from '@shared/ui-text'
import { useImageAssetsStore, type ImageEntry } from './image-assets-store'
import { SizeReadout, Thumbnail } from './image-page-parts'

function DimensionField({
  label,
  value,
  onCommit
}: {
  label: string
  value: number
  onCommit: (value: number) => void
}): React.JSX.Element {
  const [typed, setTyped] = useState<string>()

  return (
    <label className="grid gap-1">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        min={1}
        max={MAXIMUM_IMAGE_DIMENSION}
        value={typed ?? String(value)}
        className="h-7 w-full rounded-md border bg-transparent px-1"
        onChange={(event) => {
          const next = event.target.value
          setTyped(next)
          if (/^\d+$/.test(next.trim()) && Number(next) >= 1) onCommit(Number(next))
        }}
        onBlur={() => setTyped(undefined)}
      />
    </label>
  )
}

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
        aria-label={t('fonts.fontsPage.removeName', { name: entry.name })}
        className="flex-none px-2"
        variant="outline"
        onClick={() => store.getState().removeEntry(entry.id)}
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
    {entry.sources.length > 1 ? (
      <ul className="flex flex-wrap gap-1">
        {entry.sources.map((source, index) => (
          <li key={source.id} className="flex items-center gap-1 rounded border px-1 py-0.5">
            <span className="text-[11px] text-muted-foreground">{index}</span>
            <span className="max-w-24 truncate text-[11px]" title={source.name}>
              {source.name}
            </span>
            <button
              aria-label={t('images.stagedImageCard.removeFrameIndex', { index: index })}
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
        ? t('images.stagedImageCard.addFrameLength', { length: entry.sources.length })
        : t('images.stagedImageCard.makeASpriteSheet')}
    </Button>
    <label className="grid gap-1">
      <span className="text-muted-foreground">{t('images.stagedImageCard.nameAWidgetRefersTo')}</span>
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
      <span className="text-muted-foreground">{t('images.stagedImageCard.format')}</span>
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
            {t(`images.format.${format}`)}
          </option>
        ))}
      </select>
    </label>
    <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-1.5">
      <DimensionField
        label={t('images.stagedImageCard.width')}
        value={entry.width}
        onCommit={(next) => store.getState().resizeEntry(entry.id, 'width', next)}
      />
      <button
        type="button"
        aria-pressed={entry.lockAspect}
        aria-label={entry.lockAspect ? t('images.stagedImageCard.unlockProportions') : t('images.stagedImageCard.lockProportions')}
        title={
          entry.lockAspect
            ? t('images.stagedImageCard.proportionsLockedChangingOneSide')
            : t('images.stagedImageCard.proportionsFreeEachSideIs')
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
      <DimensionField
        label={t('images.stagedImageCard.height')}
        value={entry.height}
        onCommit={(next) => store.getState().resizeEntry(entry.id, 'height', next)}
      />
    </div>
    <SizeReadout entry={entry} />
  </div>
  )
}
