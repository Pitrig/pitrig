import { Images, Copy, Pause, Play, Plus } from 'lucide-react'

import {
  MAXIMUM_LED_SPRITES,
  type HardwareDeviceConfiguration,
  type LedSpriteConfiguration
} from '@shared/configuration-schema'
import { spriteDigits, spriteGeometry } from '@shared/led-sprite'
import { Group } from '@/features/configuration/inspector/Group'
import { Hint } from '@/features/configuration/inspector/fields'
import { RemoveButton } from '@/features/configuration/inspector/widget-editors'
import { HINTS } from './hints'
import { chequerSprite, diagonalSprite, discSprite } from './matrix-art'
import { drawnOf } from './modules-document'
import { useModulesStore } from './modules-store'
import {
  addBlankSprite,
  addSprite,
  canAddSprite,
  duplicateSprite,
  removeSprite,
  spriteNameFor,
  spritesOf
} from './sprite-document'

const PRESETS: ReadonlyArray<{
  id: string
  label: string
  title: string
  build: (id: string, width: number, height: number) => LedSpriteConfiguration
}> = [
  {
    id: 'sweep',
    label: 'Sweep',
    title: 'A diagonal band travelling across the panel, as many frames as the size allows',
    build: (id, width, height) => diagonalSprite(id, width, height, '#ffffff')
  },
  {
    id: 'disc',
    label: 'Disc',
    title: 'A filled circle on one frame, ready to be recoloured or blinked by its layer',
    build: (id, width, height) => discSprite(id, width, height, '#ff6d00')
  },
  {
    id: 'chequer',
    label: 'Chequer',
    title: 'A rippling chequerboard, the artwork the chequered flag draws with',
    build: (id, width, height) => chequerSprite(id, width, height)
  }
]

export function SpriteList({
  output,
  device
}: {
  output: number
  device: HardwareDeviceConfiguration
}): React.JSX.Element {
  const sprites = spritesOf(device)
  const used = new Set((device.effects ?? []).map((effect) => effect.sprite))
  const selected = useModulesStore((state) => state.sprite)
  const selectSprite = useModulesStore((state) => state.selectSprite)
  const preview = useModulesStore((state) => state.preview)
  const toggleSpritePreview = useModulesStore((state) => state.toggleSpritePreview)
  const clearPreview = useModulesStore((state) => state.clearPreview)
  const panel = drawnOf(device)
  const room = canAddSprite(device)

  const create = (built: number): void => {
    if (built >= 0) selectSprite(built)
  }

  return (
    <Group
      id="LedMatrixPictures"
      title="Pictures"
      icon={Images}
      hint={HINTS.sprite.pictures}
      summary={`${sprites.length} of ${MAXIMUM_LED_SPRITES}`}
      defaultOpen
    >
      <div className="flex flex-wrap items-center gap-1 pb-1">
        <button
          type="button"
          disabled={!room}
          title={room ? 'Draws a new picture at the size of this panel' : `A panel carries ${MAXIMUM_LED_SPRITES} pictures`}
          className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-30"
          onClick={() => create(addBlankSprite(output, device, panel.width, panel.height))}
        >
          <Plus className="size-3.5" /> New picture
        </button>
        <span className="text-[10px] text-muted-foreground">or start from</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={!room}
            title={preset.title}
            className="rounded border px-1.5 py-1 text-[10px] hover:bg-white/5 disabled:opacity-30"
            onClick={() =>
              create(
                addSprite(
                  output,
                  device,
                  preset.build(spriteNameFor(device, preset.id), panel.width, panel.height)
                )
              )
            }
          >
            {preset.label}
          </button>
        ))}
      </div>
      {sprites.length === 0 ? (
        <Hint>
          None yet. Draw one, or start from a pattern — a picture is palette-indexed pixels that
          travel inside the modules document, so it needs no upload and no restart.
        </Hint>
      ) : (
        sprites.map((sprite, at) => {
          const { width, height, frames } = spriteGeometry(sprite)
          const playing = preview?.kind === 'sprite' && preview.sprite === sprite.id
          return (
            <div
              key={at}
              className={`flex items-center gap-1 rounded px-1 py-0.5 text-xs ${
                at === selected ? 'bg-sky-500/15' : 'hover:bg-white/5'
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => selectSprite(at)}
              >
                {sprite.id}
                <span className="ml-2 text-[10px] text-muted-foreground">
                  {`${width}×${height} · ${frames} frame(s) · ${spriteDigits(sprite)} digits`}
                </span>
              </button>
              {used.has(sprite.id) ? (
                <span className="flex-none text-[10px] text-sky-300/80">in use</span>
              ) : null}
              <button
                type="button"
                aria-pressed={playing}
                aria-label={playing ? `Stop showing ${sprite.id}` : `Show ${sprite.id} on its own`}
                title="Plays this picture on its own in the preview above, and on the panel while mirroring is on"
                className={`rounded p-1 ${playing ? 'bg-sky-500/25 text-sky-300' : 'text-muted-foreground hover:bg-white/5'}`}
                onClick={() => toggleSpritePreview(output, sprite.id, 120)}
              >
                {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              </button>
              <button
                type="button"
                aria-label={`Duplicate ${sprite.id}`}
                disabled={!room}
                className="rounded p-1 text-muted-foreground hover:bg-white/5 disabled:opacity-30"
                onClick={() => create(duplicateSprite(output, device, at))}
              >
                <Copy className="size-3.5" />
              </button>
              <RemoveButton
                label={`Remove picture ${sprite.id}`}
                disabled={used.has(sprite.id)}
                onClick={() => {
                  removeSprite(output, at)
                  clearPreview(output)
                  selectSprite(at === selected ? -1 : selected > at ? selected - 1 : selected)
                }}
              />
            </div>
          )
        })
      )}
    </Group>
  )
}
