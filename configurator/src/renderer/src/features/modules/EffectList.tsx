import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Layers } from 'lucide-react'

import type { HardwareDeviceConfiguration } from '@shared/configuration-schema'
import { Group } from '@/features/configuration/inspector/Group'
import { t } from '@shared/ui-text'
import { EffectRow } from './EffectRow'
import { duplicateEffects, mergeGroups, mergeLayers } from './layer-commands'
import { layerName } from './layer-name'
import { groupLayers, type LayerGroup } from './layer-groups'
import { coverageOf, unionOf } from './layer-lamps'
import { layerWarnings } from './layer-warnings'
import { LayerThumb } from './LayerThumb'
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

function GroupHeader({
  device,
  group,
  folded,
  lamps,
  onFold,
  onPickAll
}: {
  device: HardwareDeviceConfiguration
  group: LayerGroup
  folded: boolean
  lamps: ReadonlySet<number>
  onFold: () => void
  onPickAll: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1 px-1 pt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      <button
        type="button"
        aria-expanded={!folded}
        className="flex min-w-0 flex-1 items-center gap-1 text-left"
        onClick={onFold}
      >
        {folded ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
        <span className="truncate">{group.label}</span>
        <span className="flex-none normal-case">· {group.indices.length}</span>
      </button>
      {group.indices.length > 1 ? (
        <button
          type="button"
          className="flex-none rounded px-1 normal-case hover:bg-white/5"
          title={t('modules.effectList.picksEveryLayerInThis')}
          onClick={onPickAll}
        >
          {t('modules.effectList.pickAll')}
        </button>
      ) : null}
      {folded ? <LayerThumb device={device} lamps={lamps} color="rgba(255,255,255,0.45)" /> : null}
    </div>
  )
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
  const effects = useMemo(() => device.effects ?? [], [device.effects])
  const selected = useModulesStore((state) => state.effect)
  const picked = useModulesStore((state) => state.picked)
  const selectEffect = useModulesStore((state) => state.selectEffect)
  const pickEffect = useModulesStore((state) => state.pickEffect)
  const pickEffects = useModulesStore((state) => state.pickEffects)
  const preview = useModulesStore((state) => state.preview)
  const togglePreview = useModulesStore((state) => state.togglePreview)
  const clearPreview = useModulesStore((state) => state.clearPreview)
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set())
  const groups = useMemo(() => groupLayers(effects), [effects])
  const coverage = useMemo(() => coverageOf(device), [device])
  const warnings = useMemo(() => layerWarnings(device), [device])
  const mergeable = useMemo(() => mergeGroups(device), [device])

  const fold = (key: string): void =>
    setFolded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const reorder = (index: number, to: number): void => {
    if (to === index || to < 0 || to >= effects.length) return
    moveEffect(output, index, to)
    selectEffect(selectionAfterMove(selected, index, to))
    clearPreview(output)
  }

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
        {t('modules.effectList.allPaintedAtOnceWhere')} {t('modules.effectList.ctrlClickOrShiftClick')}
      </p>
      {mergeable.length > 0 ? (
        <div className="flex items-center gap-2 rounded border border-sky-500/30 bg-sky-500/10 p-2 text-[11px] text-sky-100">
          <span className="min-w-0 flex-1">
            {t('modules.effectList.groupsDifferOnlyInLamps', { count: mergeable.length })}
          </span>
          <button
            type="button"
            title={t('modules.effectList.mergesNames', {
              names: mergeable
                .map((group) => layerName(effects[group[0] ?? 0] ?? {}, group[0] ?? 0))
                .join(', ')
            })}
            className="flex-none rounded border border-sky-500/40 px-1.5 py-0.5 hover:bg-sky-500/20"
            onClick={() => {
              mergeLayers(output, mergeable)
              clearPreview(output)
              selectEffect(-1)
            }}
          >
            {t('modules.effectList.merge')}
          </button>
        </div>
      ) : null}
      {groups.map((group) => (
        <div key={group.key}>
          <GroupHeader
            device={device}
            group={group}
            folded={folded.has(group.key)}
            lamps={unionOf(group.indices.map((index) => coverage[index] ?? new Set()))}
            onFold={() => fold(group.key)}
            onPickAll={() => pickEffects(group.indices)}
          />
          {folded.has(group.key)
            ? null
            : group.indices.map((index) => {
                const effect = effects[index]
                if (!effect) return null
                return (
                  <EffectRow
                    key={index}
                    device={device}
                    effect={effect}
                    index={index}
                    position={index}
                    last={index === effects.length - 1}
                    selected={picked.includes(index)}
                    playing={preview.some(playingLayer(output, index))}
                    warnings={warnings[index] ?? []}
                    lamps={coverage[index] ?? new Set()}
                    onPick={(event) => {
                      if (event.shiftKey) pickEffect(index, 'range')
                      else if (event.metaKey || event.ctrlKey) pickEffect(index, 'toggle')
                      else selectEffect(index)
                    }}
                    onPlay={() => togglePreview(output, index)}
                    onUp={() => reorder(index, index - 1)}
                    onDown={() => reorder(index, index + 1)}
                    onDuplicate={() => {
                      const copies = duplicateEffects(output, [index])
                      if (copies[0] !== undefined) selectEffect(copies[0])
                      clearPreview(output)
                    }}
                    onRemove={() => {
                      mutateEffects(output, (list) => {
                        list.splice(index, 1)
                      })
                      clearPreview(output)
                      selectEffect(selectionAfterRemoval(selected, index))
                    }}
                  />
                )
              })}
        </div>
      ))}
      {children}
    </Group>
  )
}
