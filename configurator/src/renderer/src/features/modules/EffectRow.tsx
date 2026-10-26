import { ArrowDown, ArrowUp, Copy, Pause, Play, TriangleAlert } from 'lucide-react'

import type { HardwareDeviceConfiguration, LedEffect } from '@shared/configuration-schema'
import { RemoveButton } from '@/features/configuration/inspector/widget-editors'
import { t } from '@shared/ui-text'
import { layerName } from './layer-name'
import { runLabel } from './layer-lamps'
import { warningText, type LayerWarning } from './layer-warnings'
import { layerColor } from './layer-color'
import { LayerThumb } from './LayerThumb'

const ICON_BUTTON = 'rounded p-1 text-muted-foreground hover:bg-white/5 disabled:opacity-30'

export interface EffectRowProps {
  device: HardwareDeviceConfiguration
  effect: LedEffect
  index: number
  position: number
  last: boolean
  selected: boolean
  playing: boolean
  warnings: readonly LayerWarning[]
  lamps: ReadonlySet<number>
  onPick: (event: React.MouseEvent) => void
  onPlay: () => void
  onUp: () => void
  onDown: () => void
  onDuplicate: () => void
  onRemove: () => void
}

export function EffectRow({
  device,
  effect,
  index,
  position,
  last,
  selected,
  playing,
  warnings,
  lamps,
  onPick,
  onPlay,
  onUp,
  onDown,
  onDuplicate,
  onRemove
}: EffectRowProps): React.JSX.Element {
  const name = layerName(effect, index)
  const warned = warnings.length > 0
  const note = warnings.map((warning) => warningText(warning, device.effects ?? [])).join(' ')
  return (
    <div
      className={`flex items-center gap-1 rounded px-1 py-0.5 ${selected ? 'bg-sky-500/15' : 'hover:bg-white/5'}`}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-xs"
        title={t('modules.effectRow.lampsOfName', { name, lamps: runLabel(lamps) || '—' })}
        onClick={onPick}
      >
        <span className="text-muted-foreground">{position + 1}.</span>
        <span className="truncate">{name}</span>
        {effect.gate && effect.gate !== 'always' ? (
          <span className="flex-none text-[10px] text-amber-400/70">{effect.gate}</span>
        ) : null}
      </button>
      {warned ? (
        <span title={note} aria-label={note} className="flex-none text-amber-400">
          <TriangleAlert className="size-3.5" />
        </span>
      ) : null}
      <LayerThumb device={device} lamps={lamps} color={layerColor(effect)} />
      <button
        type="button"
        aria-pressed={playing}
        aria-label={
          playing
            ? t('modules.effectList.stopPreviewingIndex', { index: name })
            : t('modules.effectList.previewIndex', { index: name })
        }
        title={t('modules.effectList.playsThisLayerInThe')}
        className={`rounded p-1 ${playing ? 'bg-sky-500/25 text-sky-300' : 'text-muted-foreground hover:bg-white/5'}`}
        onClick={onPlay}
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>
      <button
        type="button"
        aria-label={t('modules.effectRow.duplicateName', { name })}
        title={t('modules.effectRow.duplicateName', { name })}
        className={ICON_BUTTON}
        onClick={onDuplicate}
      >
        <Copy className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={t('modules.effectList.moveLayerNumberDownThe', { number: position + 1 })}
        disabled={position === 0}
        className={ICON_BUTTON}
        onClick={onUp}
      >
        <ArrowUp className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={t('modules.effectList.moveLayerNumberUpThe', { number: position + 1 })}
        disabled={last}
        className={ICON_BUTTON}
        onClick={onDown}
      >
        <ArrowDown className="size-3.5" />
      </button>
      <RemoveButton
        label={t('modules.effectList.removeLayerNumber', { number: index + 1 })}
        onClick={onRemove}
      />
    </div>
  )
}
