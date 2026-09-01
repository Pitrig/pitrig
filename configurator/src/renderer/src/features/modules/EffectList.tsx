import { ArrowDown, ArrowUp, Layers, Pause, Play } from 'lucide-react'

import type { HardwareDeviceConfiguration } from '@shared/configuration-schema'
import { Group } from '@/features/configuration/inspector/Group'
import { RemoveButton } from '@/features/configuration/inspector/widget-editors'
import { HINTS } from './hints'
import { layerName } from './layer-name'
import { mutateEffects, moveEffect } from './modules-document'
import { useModulesStore } from './modules-store'

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
      title="Layers"
      icon={Layers}
      hint={HINTS.effect.stack}
      summary={`${effects.length} layer(s)`}
      defaultOpen
    >
      <p className="pb-1 text-[10px] text-muted-foreground">
        Painted in order; a later layer overwrites the lamps it covers.
      </p>
      {effects.map(({ effect, index }, position) => {
        const playing = preview?.output === output && preview.effect === index
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
                  ? `Stop previewing ${layerName(effect, index)}`
                  : `Preview ${layerName(effect, index)} on its own`
              }
              title="Plays this layer on its own in the preview above, until it is pressed again"
              className={`rounded p-1 ${playing ? 'bg-sky-500/25 text-sky-300' : 'text-muted-foreground hover:bg-white/5'}`}
              onClick={() => togglePreview(output, index)}
            >
              {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>
            <button
              type="button"
              aria-label={`Move layer ${position + 1} down the stack`}
              disabled={position === 0}
              className="rounded p-1 text-muted-foreground hover:bg-white/5 disabled:opacity-30"
              onClick={() => {
                moveEffect(output, index, effects[position - 1]?.index ?? index)
                clearPreview(output)
              }}
            >
              <ArrowUp className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Move layer ${position + 1} up the stack`}
              disabled={position === effects.length - 1}
              className="rounded p-1 text-muted-foreground hover:bg-white/5 disabled:opacity-30"
              onClick={() => {
                moveEffect(output, index, effects[position + 1]?.index ?? index)
                clearPreview(output)
              }}
            >
              <ArrowDown className="size-3.5" />
            </button>
            <RemoveButton
              label={`Remove layer ${index + 1}`}
              onClick={() => {
                mutateEffects(output, (list) => {
                  list.splice(index, 1)
                })
                clearPreview(output)
                selectEffect(-1)
              }}
            />
          </div>
        )
      })}
      {children}
    </Group>
  )
}
