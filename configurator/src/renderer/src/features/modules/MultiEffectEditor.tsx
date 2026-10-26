import { Copy, Layers, Trash2 } from 'lucide-react'

import type { HardwareDeviceConfiguration, LedEffect } from '@shared/configuration-schema'
import { lampsOf } from '@shared/led-render'
import { fieldBounds } from '@shared/validate/ranges'
import { Group } from '@/features/configuration/inspector/Group'
import {
  ColorField,
  NumberField,
  OptionalColorField,
  SelectField
} from '@/features/configuration/inspector/fields'
import { t } from '@shared/ui-text'
import { applyDirection, directionOf, LAYER_DIRECTIONS, LED_EFFECT_USES_DIRECTION } from './direction'
import { wholeValue } from './field-values'
import { applyLayout, applyParts } from './lamp-parts'
import { LampsField } from './LampsField'
import { duplicateEffects, removeEffects, updateEffects } from './layer-commands'
import { layerName } from './layer-name'
import { useModulesStore } from './modules-store'

const COLORED: ReadonlySet<string> = new Set(['solid', 'animation', 'gauge', 'text'])

function shared<T>(effects: readonly LedEffect[], read: (effect: LedEffect) => T): T | undefined {
  const first = effects[0]
  if (!first) return undefined
  const value = read(first)
  return effects.every((effect) => read(effect) === value) ? value : undefined
}

function labelOf(label: string, mixed: boolean): string {
  return mixed ? t('modules.multiEffectEditor.labelMixed', { label }) : label
}

export function MultiEffectEditor({
  output,
  device,
  indices
}: {
  output: number
  device: HardwareDeviceConfiguration
  indices: readonly number[]
}): React.JSX.Element {
  const selectEffect = useModulesStore((state) => state.selectEffect)
  const pickEffects = useModulesStore((state) => state.pickEffects)
  const clearPreview = useModulesStore((state) => state.clearPreview)
  const effects = indices.flatMap((index) => {
    const effect = (device.effects ?? [])[index]
    return effect ? [effect] : []
  })
  const update = (mutation: (next: LedEffect) => void): void =>
    updateEffects(output, indices, mutation)
  const first = effects[0] ?? {}
  const lamps = shared(effects, (effect) => JSON.stringify(effect.parts ?? []))
  const blink = shared(effects, (effect) => effect.blink_ms ?? 0)
  const hold = shared(effects, (effect) => effect.hold_ms ?? 0)
  const ground = shared(effects, (effect) => effect.background_color ?? '')
  const color = shared(effects, (effect) => effect.color ?? '#ffffff')
  const types = new Set(effects.map((effect) => effect.type ?? 'solid'))
  const colored = [...types].every((type) => COLORED.has(type))
  const directed = [...types].every((type) => LED_EFFECT_USES_DIRECTION.has(type))
  const direction = shared(effects, directionOf)

  return (
    <Group
      id="LedLayers"
      title={t('modules.multiEffectEditor.countLayers', { count: effects.length })}
      icon={Layers}
      summary={effects.map((effect, at) => layerName(effect, indices[at] ?? at)).join(', ')}
      defaultOpen
    >
      <p className="text-[10px] text-muted-foreground">{t('modules.multiEffectEditor.whatYouChangeHere')}</p>
      {device.type === 'rgb_strip' ? (
        <LampsField
          device={device}
          parts={first.parts}
          layout={first.layout}
          mixed={lamps === undefined}
          onParts={(parts) => update((next) => applyParts(next, parts, lampsOf(device)))}
          onLayout={(layout) => update((next) => applyLayout(next, layout))}
        />
      ) : null}
      <NumberField
        label={labelOf(t('modules.effectGate.blink'), blink === undefined)}
        suffix="ms"
        value={blink ?? first.blink_ms ?? 0}
        {...fieldBounds('LedEffect', 'blink_ms')}
        onChange={(value) => update((next) => { next.blink_ms = wholeValue('LedEffect', 'blink_ms', value) })}
      />
      <NumberField
        label={labelOf(t('modules.effectGate.hold'), hold === undefined)}
        suffix="ms"
        value={hold ?? first.hold_ms ?? 0}
        {...fieldBounds('LedEffect', 'hold_ms')}
        onChange={(value) => update((next) => { next.hold_ms = wholeValue('LedEffect', 'hold_ms', value) })}
      />
      <OptionalColorField
        label={labelOf(t('modules.effectGate.coversLayersBelow'), ground === undefined)}
        unsetLabel={t('modules.effectGate.noTheyShowThrough')}
        hint={t('modules.hints.effect.background')}
        value={ground === undefined ? first.background_color : ground || undefined}
        onChange={(next) =>
          update((effect) => {
            if (next) effect.background_color = next
            else delete effect.background_color
          })
        }
      />
      {colored ? (
        <ColorField
          label={labelOf(t('modules.effectEditor.colour'), color === undefined)}
          value={color ?? first.color ?? '#ffffff'}
          onChange={(next) => update((effect) => { effect.color = next })}
        />
      ) : null}
      {directed ? (
        <SelectField
          label={labelOf(t('modules.effectEditor.direction'), direction === undefined)}
          value={direction ?? directionOf(first)}
          options={LAYER_DIRECTIONS}
          onChange={(next) => update((effect) => applyDirection(effect, next))}
        />
      ) : null}
      <div className="flex gap-1 pt-1">
        <button
          type="button"
          className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-white/5"
          onClick={() => {
            const copies = duplicateEffects(output, indices)
            if (copies.length > 0) pickEffects(copies)
            clearPreview(output)
          }}
        >
          <Copy className="size-3.5" /> {t('modules.multiEffectEditor.duplicateCount', { count: effects.length })}
        </button>
        <button
          type="button"
          className="flex items-center gap-1 rounded border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
          onClick={() => {
            removeEffects(output, indices)
            clearPreview(output)
            selectEffect(-1)
          }}
        >
          <Trash2 className="size-3.5" /> {t('modules.multiEffectEditor.removeCount', { count: effects.length })}
        </button>
      </div>
    </Group>
  )
}
