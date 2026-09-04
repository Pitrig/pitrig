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
import { t } from '@shared/ui-text'
import { chequerSprite, diagonalSprite, discSprite } from './matrix-art'
import { drawnOf } from './modules-document'
import { playingSprite, useModulesStore } from './modules-store'
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
    label: t('modules.spriteList.sweep'),
    title: t('modules.spriteList.aDiagonalBandTravellingAcross'),
    build: (id, width, height) => diagonalSprite(id, width, height, '#ffffff')
  },
  {
    id: 'disc',
    label: t('modules.spriteList.disc'),
    title: t('modules.spriteList.aFilledCircleOnOne'),
    build: (id, width, height) => discSprite(id, width, height, '#ff6d00')
  },
  {
    id: 'chequer',
    label: t('modules.spriteList.chequer'),
    title: t('modules.spriteList.aRipplingChequerboardTheArtwork'),
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
      title={t('modules.modulesPage.pictures')}
      icon={Images}
      hint={t('modules.hints.sprite.pictures')}
      summary={t('modules.spriteList.lengthOfMaximumLedSprites', { length: sprites.length, mAXIMUM_LED_SPRITES: MAXIMUM_LED_SPRITES })}
      defaultOpen
    >
      <div className="flex flex-wrap items-center gap-1 pb-1">
        <button
          type="button"
          disabled={!room}
          title={room ? t('modules.spriteList.drawsANewPictureAt') : t('modules.spriteList.aPanelCarriesMaximumLed', { mAXIMUM_LED_SPRITES: MAXIMUM_LED_SPRITES })}
          className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-30"
          onClick={() => create(addBlankSprite(output, device, panel.width, panel.height))}
        >
          <Plus className="size-3.5" /> {t('modules.spriteList.newPicture')}
        </button>
        <span className="text-[10px] text-muted-foreground">{t('modules.spriteList.orStartFrom')}</span>
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
          {t('modules.spriteList.noneYetDrawOneOr')}</Hint>
      ) : (
        sprites.map((sprite, at) => {
          const { width, height, frames } = spriteGeometry(sprite)
          const playing = preview.some(playingSprite(output, sprite.id ?? ''))
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
                  {t('modules.spriteList.widthHeightFramesFrameS', { width: width, height: height, frames: frames, sprite: spriteDigits(sprite) })}
                </span>
              </button>
              {used.has(sprite.id) ? (
                <span className="flex-none text-[10px] text-sky-300/80">{t('modules.spriteList.inUse')}</span>
              ) : null}
              <button
                type="button"
                aria-pressed={playing}
                aria-label={playing ? t('modules.spriteList.stopShowingId', { id: sprite.id }) : t('modules.spriteList.showIdOnItsOwn', { id: sprite.id })}
                title={t('modules.spriteList.playsThisPictureInThe')}
                className={`rounded p-1 ${playing ? 'bg-sky-500/25 text-sky-300' : 'text-muted-foreground hover:bg-white/5'}`}
                onClick={() => toggleSpritePreview(output, sprite.id, 120)}
              >
                {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              </button>
              <button
                type="button"
                aria-label={t('modules.spriteList.duplicateId', { id: sprite.id })}
                disabled={!room}
                className="rounded p-1 text-muted-foreground hover:bg-white/5 disabled:opacity-30"
                onClick={() => create(duplicateSprite(output, device, at))}
              >
                <Copy className="size-3.5" />
              </button>
              <RemoveButton
                label={t('modules.spriteList.removePictureId', { id: sprite.id })}
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
