import { ArrowDown, ArrowUp, Layers, Pause, Play } from 'lucide-react'

import type { HardwareDeviceConfiguration } from '@shared/configuration-schema'
import { Group } from '@/features/configuration/inspector/Group'
import { RemoveButton } from '@/features/configuration/inspector/widget-editors'
import { t } from '@shared/ui-text'
import { layerName } from './layer-name'
import { mutateEffects, moveEffect } from './modules-document'
import { playingLayer, useModulesStore } from './modules-store'

function selectionAfterMove(selected: number, from: number, to: number): number {
  if (selected < 0) return selected
  if (selected === from) return to
  if (from < selected && to >= selected) return selected - 1
  if (from > selected && to <= selected) return selected + 1
  return selected
}

function selectionAfterRemoval(selected: number, removed: number): number {
  if (selected < 0 || selected === removed) return -1
  return selected > removed ? selected - 1 : selected
}

export function EffectList({
  output,
  device,
  children
}: {
  output: number
  device: HardwareDeviceConfiguration
  children?: React.ReactNode
}): React.JSX.Element {
  const effects = (device.effects ?? []).map((effect, index) => ({ effect, index }))
  const selected = useModulesStore((state) => state.effect)
  const selectEffect = useModulesStore((state) => state.selectEffect)
  const preview = useModulesStore((state) => state.preview)
  const togglePreview = useModulesStore((state) => state.togglePreview)
  const clearPreview = useModulesStore((state) => state.clearPreview)

  return (
    <Group
      id={device.type === 'rgb_matrix' ? 'LedMatrixLayers' : 'LedStripLayers'}
      title={t('modules.effectList.layers')}
      icon={Layers}
      hint={t('modules.hints.effect.stack')}
      summary={t('modules.effectList.lengthLayerS', { length: effects.length })}
      defaultOpen
    >
      <p className="pb-1 text-[10px] text-muted-foreground">
        {t('modules.effectList.allPaintedAtOnceWhere')}</p>
      {effects.map(({ effect, index }, position) => {
        const playing = preview.some(playingLayer(output, index))
        const reorder = (to: number): void => {
          if (to === index) return
          moveEffect(output, index, to)
          selectEffect(selectionAfterMove(selected, index, to))
          clearPreview(output)
        }
        return (
          <div
            key={index}
            className={`flex items-center gap-1 rounded px-1 py-0.5 ${index === selected ? 'bg-sky-500/15' : 'hover:bg-white/5'}`}
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-xs"
              onClick={() => selectEffect(index)}
            >
              <span className="text-muted-foreground">{position + 1}.</span>{' '}
              {/* eslint-disable-next-line no-restricted-syntax */}
              {effect.id || (effect.type ?? 'solid')}
              {effect.gate && effect.gate !== 'always' ? (
                <span className="ml-1 text-[10px] text-amber-400/70">{effect.gate}</span>
              ) : null}
            </button>
            <button
              type="button"
              aria-pressed={playing}
              aria-label={
                playing
                  ? t('modules.effectList.stopPreviewingIndex', { index: layerName(effect, index) })
                  : t('modules.effectList.previewIndex', { index: layerName(effect, index) })
              }
              title={t('modules.effectList.playsThisLayerInThe')}
              className={`rounded p-1 ${playing ? 'bg-sky-500/25 text-sky-300' : 'text-muted-foreground hover:bg-white/5'}`}
              onClick={() => togglePreview(output, index)}
            >
              {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>
            <button
              type="button"
              aria-label={t('modules.effectList.moveLayerNumberDownThe', { number: position + 1 })}
              disabled={position === 0}
              className="rounded p-1 text-muted-foreground hover:bg-white/5 disabled:opacity-30"
              onClick={() => reorder(effects[position - 1]?.index ?? index)}
            >
              <ArrowUp className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label={t('modules.effectList.moveLayerNumberUpThe', { number: position + 1 })}
              disabled={position === effects.length - 1}
              className="rounded p-1 text-muted-foreground hover:bg-white/5 disabled:opacity-30"
              onClick={() => reorder(effects[position + 1]?.index ?? index)}
            >
              <ArrowDown className="size-3.5" />
            </button>
            <RemoveButton
              label={t('modules.effectList.removeLayerNumber', { number: index + 1 })}
              onClick={() => {
                mutateEffects(output, (list) => {
                  list.splice(index, 1)
                })
                clearPreview(output)
                selectEffect(selectionAfterRemoval(selected, index))
              }}
            />
          </div>
        )
      })}
      {children}
    </Group>
  )
}
