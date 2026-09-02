import { useEffect, useState } from 'react'
import { Brush, Eraser, Layers, Monitor, PaintBucket } from 'lucide-react'

import {
  IMAGE_ID_CAPACITY,
  MAXIMUM_LED_EFFECTS,
  MAXIMUM_MATRIX_SIDE,
  type HardwareDeviceConfiguration
} from '@shared/configuration-schema'
import {
  SPRITE_DIGIT_BUDGET,
  TRANSPARENT_INK,
  spriteDigits,
  spriteGeometry
} from '@shared/led-sprite'
import { Group } from '@/features/configuration/inspector/Group'
import { IdField, NumberInput } from '@/features/configuration/inspector/fields'
import { PropertyRow } from '@/features/configuration/inspector/PropertyRow'
import { t } from '@shared/ui-text'
import { drawnOf, mutateEffects } from './modules-document'
import { playingSprite, useModulesStore } from './modules-store'
import { SpriteCanvas } from './SpriteCanvas'
import { SpriteFrames } from './SpriteFrames'
import { SpritePalette } from './SpritePalette'
import { fillFrame, renameSprite, resizeSprite, spritesOf } from './sprite-document'

const SPEEDS: readonly number[] = [60, 90, 120, 180, 250, 400, 700, 1000]
const DEFAULT_SPEED = 120

export function SpriteEditor({
  output,
  device,
  at
}: {
  output: number
  device: HardwareDeviceConfiguration
  at: number
}): React.JSX.Element | null {
  const sprite = spritesOf(device)[at]
  const frame = useModulesStore((state) => state.frame)
  const selectFrame = useModulesStore((state) => state.selectFrame)
  const ink = useModulesStore((state) => state.ink)
  const selectInk = useModulesStore((state) => state.selectInk)
  const preview = useModulesStore((state) => state.preview)
  const toggleSpritePreview = useModulesStore((state) => state.toggleSpritePreview)
  const setPreviewSpeed = useModulesStore((state) => state.setPreviewSpeed)
  const selectEffect = useModulesStore((state) => state.selectEffect)
  const setDeviceView = useModulesStore((state) => state.setDeviceView)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(DEFAULT_SPEED)
  const [onion, setOnion] = useState(true)
  const frames = sprite ? spriteGeometry(sprite).frames : 1
  const shown = Math.min(frame, frames - 1)

  useEffect(() => {
    if (!playing || frames < 2) return undefined
    const timer = window.setInterval(
      () => selectFrame((useModulesStore.getState().frame + 1) % frames),
      speed
    )
    return () => window.clearInterval(timer)
  }, [frames, playing, selectFrame, speed])

  if (!sprite) return null
  const { width, height } = spriteGeometry(sprite)
  const panel = drawnOf(device)
  const fitted = width === panel.width && height === panel.height
  const mirrored = preview.some(playingSprite(output, sprite.id ?? ''))
  const layers = device.effects ?? []
  const drawn = layers.some((effect) => effect.sprite === sprite.id)

  const addLayer = (): void => {
    if (layers.length >= MAXIMUM_LED_EFFECTS) return
    mutateEffects(output, (effects) => {
      effects.push({
        type: 'sprite',
        id: sprite.id,
        sprite: sprite.id,
        ...(frames > 1 ? { sprite_loop: true, speed_ms: speed } : {})
      })
    })
    selectEffect(layers.length)
    setDeviceView('layers')
  }

  return (
    <Group
      id="LedSpriteEditor"
      title={sprite.id || 'Picture'}
      icon={Brush}
      summary={t('modules.spriteEditor.widthHeightFramesFrameS', { width: width, height: height, frames: frames })}
      defaultOpen
    >
      <IdField
        label={t('device.infoPage.name')}
        hint={t('modules.hints.sprite.name')}
        value={sprite.id}
        capacity={IMAGE_ID_CAPACITY}
        onCommit={(name) => renameSprite(output, device, at, name)}
      />
      <PropertyRow label={t('modules.outputEditor.size')} hint={t('modules.hints.sprite.size')}>
        <div className="flex items-center gap-1">
          <NumberInput
            title={t('modules.outputEditor.columns')}
            value={width}
            min={1}
            max={MAXIMUM_MATRIX_SIDE}
            onChange={(value) => resizeSprite(output, at, Math.max(1, value), height)}
          />
          <NumberInput
            title={t('modules.outputEditor.rows')}
            value={height}
            min={1}
            max={MAXIMUM_MATRIX_SIDE}
            onChange={(value) => resizeSprite(output, at, width, Math.max(1, value))}
          />
          <button
            type="button"
            disabled={fitted}
            title={t('modules.spriteEditor.matchesThePanelWidthBy', { width: panel.width, height: panel.height })}
            className="flex-none rounded border px-1.5 py-1 text-[10px] hover:bg-white/5 disabled:opacity-30"
            onClick={() => resizeSprite(output, at, panel.width, panel.height)}
          >
            {t('modules.spriteEditor.fitPanel')}</button>
        </div>
      </PropertyRow>
      <SpritePalette output={output} at={at} sprite={sprite} ink={ink} onPick={selectInk} />
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          className="flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] hover:bg-white/5"
          title={t('modules.spriteEditor.paintsEveryPixelOfThis')}
          onClick={() => fillFrame(output, at, shown, ink)}
        >
          <PaintBucket className="size-3" /> {t('modules.spriteEditor.fillFrame')}
        </button>
        <button
          type="button"
          className="flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] hover:bg-white/5"
          title={t('modules.spriteEditor.clearsThisFrameLeavingThe')}
          onClick={() => fillFrame(output, at, shown, TRANSPARENT_INK)}
        >
          <Eraser className="size-3" /> {t('modules.spriteEditor.clearFrame')}
        </button>
        <label className="flex items-center gap-1 rounded border px-1.5 py-1 text-[10px]">
          <input
            type="checkbox"
            className="size-3"
            checked={onion}
            onChange={(event) => setOnion(event.target.checked)}
          />
          {t('modules.spriteEditor.ghostPreviousFrame')}</label>
        <label className="flex items-center gap-1 rounded border px-1.5 py-1 text-[10px]">
          {t('modules.effectEditor.frameHolds')}<select
            className="rounded bg-background px-1 py-0.5"
            value={speed}
            onChange={(event) => {
              setSpeed(Number(event.target.value))
              setPreviewSpeed(Number(event.target.value))
            }}
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value}>{t('modules.spriteEditor.valueMs', { value: value })}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={layers.length >= MAXIMUM_LED_EFFECTS}
          title={
            drawn
              ? t('modules.spriteEditor.addsAnotherLayerDrawingThis')
              : t('modules.spriteEditor.addsALayerThatDraws')
          }
          className="flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] hover:bg-white/5 disabled:opacity-30"
          onClick={addLayer}
        >
          <Layers className="size-3" /> {drawn ? t('modules.spriteEditor.addAnotherLayer') : t('modules.spriteEditor.addALayer')}
        </button>
        <button
          type="button"
          aria-pressed={mirrored}
          title={t('modules.hints.sprite.mirror')}
          className={`flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] hover:bg-white/5 ${
            mirrored ? 'border-sky-500/60 bg-sky-500/10 text-sky-300' : ''
          }`}
          onClick={() => toggleSpritePreview(output, sprite.id, speed)}
        >
          <Monitor className="size-3" /> {mirrored ? t('modules.spriteEditor.showingOnPanel') : t('modules.spriteEditor.showOnPanel')}
        </button>
      </div>
      <SpriteCanvas
        output={output}
        at={at}
        sprite={sprite}
        frame={shown}
        ink={ink}
        onion={onion}
      />
      <SpriteFrames
        output={output}
        at={at}
        sprite={sprite}
        frame={shown}
        playing={playing}
        onSelect={(next) => {
          setPlaying(false)
          selectFrame(next)
        }}
        onPlay={() => setPlaying(!playing)}
      />
      <p className="text-[10px] text-muted-foreground">
        {t('modules.spriteEditor.spriteOfSpriteDigitBudget', { sprite: spriteDigits(sprite), sPRITE_DIGIT_BUDGET: SPRITE_DIGIT_BUDGET })}
      </p>
    </Group>
  )
}
