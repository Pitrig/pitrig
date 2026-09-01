import { useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'

import {
  MAXIMUM_LED_SPRITES,
  MAXIMUM_LED_SPRITE_FRAMES,
  LED_PALETTE_SIZE,
  type HardwareDeviceConfiguration,
  type LedSpriteConfiguration
} from '@shared/configuration-schema'
import { fieldBounds } from '@shared/validate/ranges'
import { Group } from '@/features/configuration/inspector/Group'
import { PropertyRow } from '@/features/configuration/inspector/PropertyRow'
import {
  ColorSwatchInput,
  Hint,
  NumberInput,
  TextInput
} from '@/features/configuration/inspector/fields'
import { AddButton, RemoveButton } from '@/features/configuration/inspector/widget-editors'
import {
  DEFAULT_PALETTE,
  blankPixels,
  mutateSprite,
  mutateSprites,
  nextSpriteId,
  resizePixels,
  setPixel
} from './sprite-document'

const CELL = 16
const TRANSPARENT_INK = 15
const CHECKER =
  'repeating-conic-gradient(rgba(255,255,255,0.18) 0% 25%, rgba(255,255,255,0.04) 0% 50%) 0 0 / 8px 8px'

export function SpriteEditor({
  output,
  device
}: {
  output: number
  device: HardwareDeviceConfiguration
}): React.JSX.Element {
  const sprites = device.sprites ?? []
  const [ink, setInk] = useState(1)
  const [frames, setFrames] = useState<Record<number, number>>({})

  return (
    <Group
      id="LedSprites"
      title="Sprites"
      icon={ImageIcon}
      summary={`${sprites.length} sprite(s)`}
      hint="Pictures a matrix layer draws, stored palette-indexed inside this document rather than uploaded: nothing to install, nothing to restart, and a saved configuration carries its artwork with it."
    >
      {sprites.map((sprite, index) => {
        const width = sprite.width ?? 8
        const height = sprite.height ?? 8
        const count = sprite.frame_count ?? 1
        const frame = Math.min(frames[index] ?? 0, count - 1)
        const palette = sprite.palette ?? []
        const pixels = sprite.pixels ?? blankPixels(sprite)
        return (
          <div key={index} className="space-y-2 rounded border border-white/10 p-2">
            <div className="flex items-center gap-1">
              <TextInput
                value={sprite.id ?? ''}
                placeholder="name"
                onChange={(id) => mutateSprite(output, index, (next) => { next.id = id })}
              />
              <RemoveButton
                label={`Remove sprite ${index + 1}`}
                onClick={() => mutateSprites(output, (list) => { list.splice(index, 1) })}
              />
            </div>
            <PropertyRow label="Size">
              <div className="grid grid-cols-3 gap-1">
                <NumberInput
                  title="Columns"
                  value={width}
                  {...fieldBounds('LedSpriteConfiguration', 'width')}
                  onChange={(value) => mutateSprite(output, index, (next) => {
                    next.pixels = resizePixels(sprite, { ...sprite, width: value })
                    next.width = value
                  })}
                />
                <NumberInput
                  title="Rows"
                  value={height}
                  {...fieldBounds('LedSpriteConfiguration', 'height')}
                  onChange={(value) => mutateSprite(output, index, (next) => {
                    next.pixels = resizePixels(sprite, { ...sprite, height: value })
                    next.height = value
                  })}
                />
                <NumberInput
                  title="Frames"
                  value={count}
                  min={1}
                  max={MAXIMUM_LED_SPRITE_FRAMES}
                  onChange={(value) => mutateSprite(output, index, (next) => {
                    next.pixels = resizePixels(sprite, { ...sprite, frame_count: value })
                    next.frame_count = value
                  })}
                />
              </div>
              <div className="grid grid-cols-3 gap-1 pt-0.5 text-[10px] text-muted-foreground">
                <span>Columns</span>
                <span>Rows</span>
                <span>Frames</span>
              </div>
            </PropertyRow>
            <PropertyRow label="Palette">
              <div className="flex flex-wrap items-center gap-1">
                {palette.map((entry, slot) => (
                  <button
                    key={slot}
                    type="button"
                    aria-label={`Draw with palette entry ${slot}`}
                    className={`rounded ${slot === ink ? 'ring-2 ring-sky-400' : ''}`}
                    onClick={() => setInk(slot)}
                  >
                    <ColorSwatchInput
                      label={`Palette entry ${slot}`}
                      value={entry.color ?? '#000000'}
                      onChange={(color) => mutateSprite(output, index, (next) => {
                        const list = [...(next.palette ?? [])]
                        list[slot] = { color }
                        next.palette = list
                      })}
                    />
                  </button>
                ))}
                {palette.length < LED_PALETTE_SIZE ? (
                  <>
                    <button
                      type="button"
                      aria-label="Draw transparent pixels"
                      title="Transparent — the layers below stay visible"
                      className={`size-6 rounded ring-1 ring-inset ring-white/20 ${ink === TRANSPARENT_INK ? 'ring-2 ring-sky-400' : ''}`}
                      style={{ background: CHECKER }}
                      onClick={() => setInk(TRANSPARENT_INK)}
                    />
                    <AddButton
                      label="Add colour"
                      onClick={() => mutateSprite(output, index, (next) => {
                        const list = next.palette ?? []
                        const colour = DEFAULT_PALETTE[list.length % DEFAULT_PALETTE.length]
                        if (colour) next.palette = [...list, { color: colour }]
                      })}
                    />
                  </>
                ) : null}
              </div>
            </PropertyRow>
            {count > 1 ? (
              <PropertyRow label="Frame">
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: count }, (_, at) => (
                    <button
                      key={at}
                      type="button"
                      className={`rounded border px-2 text-[11px] ${at === frame ? 'border-sky-500/60 bg-sky-500/10' : 'hover:bg-white/5'}`}
                      onClick={() => setFrames({ ...frames, [index]: at })}
                    >
                      {at + 1}
                    </button>
                  ))}
                </div>
              </PropertyRow>
            ) : null}
            <div
              className="grid w-fit gap-[2px] rounded border border-white/10 bg-black/50 p-1"
              style={{ gridTemplateColumns: `repeat(${width}, ${CELL}px)` }}
            >
              {Array.from({ length: height }, (_, y) =>
                Array.from({ length: width }, (_, x) => {
                  const at = frame * width * height + y * width + x
                  const slot = Number.parseInt(pixels[at] ?? '0', 16)
                  const entry = palette[slot]?.color
                  return (
                    <button
                      key={`${x}-${y}`}
                      type="button"
                      aria-label={`Pixel ${x}, ${y}`}
                      className="rounded-[2px] ring-1 ring-inset ring-white/10"
                      style={{ width: CELL, height: CELL, background: entry ?? CHECKER }}
                      onClick={() => setPixel(output, index, frame, x, y, ink)}
                    />
                  )
                })
              )}
            </div>
          </div>
        )
      })}
      {sprites.length < MAXIMUM_LED_SPRITES ? (
        <AddButton
          label="Add sprite"
          onClick={() => mutateSprites(output, (list) => {
            const sprite: LedSpriteConfiguration = {
              id: nextSpriteId(device),
              width: 8,
              height: 8,
              frame_count: 1,
              palette: [{ color: '#000000' }, { color: '#ff0000' }]
            }
            list.push({ ...sprite, pixels: blankPixels(sprite) })
          })}
        />
      ) : (
        <Hint>{`One output carries at most ${MAXIMUM_LED_SPRITES} sprites.`}</Hint>
      )}
    </Group>
  )
}
