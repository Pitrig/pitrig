import { ChevronLeft, ChevronRight, Copy, Pause, Play, Plus } from 'lucide-react'

import type { LedSpriteConfiguration } from '@shared/configuration-schema'
import { frameOf, inkAt, inkColor, maxFramesFor, spriteGeometry } from '@shared/led-sprite'
import { PropertyRow } from '@/features/configuration/inspector/PropertyRow'
import { RemoveButton } from '@/features/configuration/inspector/widget-editors'
import { HINTS } from './hints'
import { addFrame, dropFrame, reorderFrame } from './sprite-document'

const THUMB = 44

function Thumbnail({
  sprite,
  frame
}: {
  sprite: LedSpriteConfiguration
  frame: number
}): React.JSX.Element {
  const { width, height } = spriteGeometry(sprite)
  const digits = frameOf(sprite, frame)
  return (
    <span
      className="grid rounded-sm bg-black"
      style={{
        width: THUMB,
        height: THUMB,
        gridTemplateColumns: `repeat(${width}, 1fr)`,
        gridTemplateRows: `repeat(${height}, 1fr)`
      }}
    >
      {Array.from({ length: width * height }, (_, pixel) => (
        <span
          key={pixel}
          style={{ background: inkColor(sprite, inkAt(digits, pixel)) ?? 'transparent' }}
        />
      ))}
    </span>
  )
}

export function SpriteFrames({
  output,
  at,
  sprite,
  frame,
  playing,
  onSelect,
  onPlay
}: {
  output: number
  at: number
  sprite: LedSpriteConfiguration
  frame: number
  playing: boolean
  onSelect: (frame: number) => void
  onPlay: () => void
}): React.JSX.Element {
  const { width, height, frames } = spriteGeometry(sprite)
  const ceiling = maxFramesFor(width, height)
  const full = frames >= ceiling

  const move = (to: number): void => {
    if (to < 0 || to >= frames) return
    reorderFrame(output, at, frame, to)
    onSelect(to)
  }

  return (
    <PropertyRow label="Frames" hint={HINTS.sprite.frames} block>
      <div className="flex items-center gap-1 pb-1 text-[10px] text-muted-foreground">
        <span>{`${frames} of ${ceiling} this size allows`}</span>
        <button
          type="button"
          aria-pressed={playing}
          aria-label={playing ? 'Stop playing the frames' : 'Play the frames'}
          disabled={frames < 2}
          className={`ml-auto rounded p-1 hover:bg-white/5 disabled:opacity-30 ${
            playing ? 'bg-sky-500/25 text-sky-300' : ''
          }`}
          onClick={onPlay}
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
        <button
          type="button"
          aria-label="Move this frame earlier"
          disabled={frame === 0}
          className="rounded p-1 hover:bg-white/5 disabled:opacity-30"
          onClick={() => move(frame - 1)}
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Move this frame later"
          disabled={frame >= frames - 1}
          className="rounded p-1 hover:bg-white/5 disabled:opacity-30"
          onClick={() => move(frame + 1)}
        >
          <ChevronRight className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Duplicate this frame"
          title="Copies this frame after it, which is how one drawing becomes the next"
          disabled={full}
          className="rounded p-1 hover:bg-white/5 disabled:opacity-30"
          onClick={() => {
            addFrame(output, at, frame, true)
            onSelect(frame + 1)
          }}
        >
          <Copy className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Add an empty frame"
          disabled={full}
          title={full ? `A ${width} by ${height} picture holds ${ceiling} frames` : undefined}
          className="rounded p-1 hover:bg-white/5 disabled:opacity-30"
          onClick={() => {
            addFrame(output, at, frame, false)
            onSelect(frame + 1)
          }}
        >
          <Plus className="size-3.5" />
        </button>
        <RemoveButton
          label="Remove this frame"
          disabled={frames <= 1}
          onClick={() => {
            dropFrame(output, at, frame)
            onSelect(Math.max(0, frame - 1))
          }}
        />
      </div>
      <div className="flex max-w-full flex-wrap gap-1 rounded border border-white/10 bg-black/30 p-1">
        {Array.from({ length: frames }, (_, index) => (
          <button
            key={index}
            type="button"
            aria-pressed={index === frame}
            aria-label={`Frame ${index + 1}`}
            className={`rounded border p-0.5 ${
              index === frame ? 'border-sky-500/70 bg-sky-500/10' : 'border-white/10'
            }`}
            onClick={() => onSelect(index)}
          >
            <Thumbnail sprite={sprite} frame={index} />
            <span className="block pt-0.5 text-center text-[9px] text-muted-foreground">
              {index + 1}
            </span>
          </button>
        ))}
      </div>
    </PropertyRow>
  )
}
