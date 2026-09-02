import { Plus } from 'lucide-react'

import type { LedSpriteConfiguration, RgbColor } from '@shared/configuration-schema'
import { TRANSPARENT_INK, USABLE_PALETTE, paletteOf, transparentInk } from '@shared/led-sprite'
import { ColorSwatchInput } from '@/features/configuration/inspector/fields'
import { PropertyRow } from '@/features/configuration/inspector/PropertyRow'
import { RemoveButton } from '@/features/configuration/inspector/widget-editors'
import { t } from '@shared/ui-text'
import { addInk, removeInk, setInkColor } from './sprite-document'

const NEXT_INK: RgbColor = '#ff9100'

export function SpritePalette({
  output,
  at,
  sprite,
  ink,
  onPick
}: {
  output: number
  at: number
  sprite: LedSpriteConfiguration
  ink: number
  onPick: (ink: number) => void
}): React.JSX.Element {
  const palette = paletteOf(sprite)
  const clear = transparentInk(sprite)

  return (
    <PropertyRow label={t('modules.spritePalette.inks')} hint={t('modules.hints.sprite.palette')} block>
      <div className="flex flex-wrap items-center gap-1">
        {palette.map((entry, index) => {
          const color = entry.color ?? '#000000'
          const chosen = index === ink
          return (
            <div
              key={index}
              className={`flex items-center gap-1 rounded border px-1 py-0.5 ${
                chosen ? 'border-sky-500/60 bg-sky-500/10' : 'border-white/10'
              }`}
            >
              <button
                type="button"
                aria-pressed={chosen}
                aria-label={`Ink ${index + 1}, ${color}`}
                title={index === 0 ? t('modules.spritePalette.colorEntry1IsThe', { color: color }) : color}
                className="size-4 rounded-sm ring-1 ring-inset ring-white/20"
                style={{ background: color }}
                onClick={() => onPick(index)}
              />
              <ColorSwatchInput
                label={`Ink ${index + 1}`}
                value={color}
                onChange={(next) => setInkColor(output, at, index, next)}
              />
              {palette.length > 1 ? (
                <RemoveButton
                  label={`Remove ink ${index + 1}`}
                  onClick={() => {
                    removeInk(output, at, index)
                    if (ink >= palette.length - 1) onPick(Math.max(0, palette.length - 2))
                  }}
                />
              ) : null}
            </div>
          )
        })}
        <button
          type="button"
          disabled={palette.length >= USABLE_PALETTE}
          title={
            palette.length >= USABLE_PALETTE
              ? t('modules.spritePalette.aPictureNamesUsablePalette', { uSABLE_PALETTE: USABLE_PALETTE })
              : t('modules.spritePalette.addsAnotherColourToThis')
          }
          className="flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] hover:bg-white/5 disabled:opacity-30"
          onClick={() => {
            addInk(output, at, NEXT_INK)
            onPick(palette.length)
          }}
        >
          <Plus className="size-3" /> {t('modules.spritePalette.ink')}
        </button>
        <button
          type="button"
          aria-pressed={ink === TRANSPARENT_INK}
          disabled={clear === undefined}
          title={
            clear === undefined
              ? t('modules.spritePalette.thisPictureNamesAllSixteen')
              : t('modules.spritePalette.clearsAPixelLeavingThe')
          }
          className={`rounded border px-1.5 py-1 text-[10px] hover:bg-white/5 disabled:opacity-30 ${
            ink === TRANSPARENT_INK ? 'border-sky-500/60 bg-sky-500/10' : ''
          }`}
          onClick={() => onPick(TRANSPARENT_INK)}
        >
          {t('modules.spritePalette.clear')}</button>
      </div>
    </PropertyRow>
  )
}
