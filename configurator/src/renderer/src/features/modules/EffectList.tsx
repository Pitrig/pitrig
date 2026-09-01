import { ArrowDown, ArrowUp, Eye, EyeOff, Layers } from 'lucide-react'

import { MAXIMUM_LED_EFFECTS, type HardwareDeviceConfiguration } from '@shared/configuration-schema'
import { Group } from '@/features/configuration/inspector/Group'
import { Hint } from '@/features/configuration/inspector/fields'
import { AddButton, RemoveButton } from '@/features/configuration/inspector/widget-editors'
import { HINTS } from './hints'
import { mutateEffects, moveEffect } from './modules-document'
import { useModulesStore } from './modules-store'

export function EffectList({
  output,
  device
}: {
  output: number
  device: HardwareDeviceConfiguration
}): React.JSX.Element {
  const effects = (device.effects ?? []).map((effect, index) => ({ effect, index }))
  const selected = useModulesStore((state) => state.effect)
  const selectEffect = useModulesStore((state) => state.selectEffect)
  const gates = useModulesStore((state) => state.gates)
  const toggleGate = useModulesStore((state) => state.toggleGate)
  const clearGates = useModulesStore((state) => state.clearGates)

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
        const key = `${output}:${index}`
        const shown = gates[key] !== false
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
              aria-label={shown ? `Hide layer ${index + 1} in the preview` : `Show layer ${index + 1} in the preview`}
              title="Only affects this preview, not the board"
              className="rounded p-1 text-muted-foreground hover:bg-white/5"
              onClick={() => toggleGate(key)}
            >
              {shown ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5 opacity-40" />}
            </button>
            <button
              type="button"
              aria-label={`Move layer ${position + 1} down the stack`}
              disabled={position === 0}
              className="rounded p-1 text-muted-foreground hover:bg-white/5 disabled:opacity-30"
              onClick={() => {
                moveEffect(output, index, effects[position - 1]?.index ?? index)
                clearGates(output)
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
                clearGates(output)
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
                clearGates(output)
                selectEffect(-1)
              }}
            />
          </div>
        )
      })}
      {effects.length < MAXIMUM_LED_EFFECTS ? (
        <AddButton
          label="Add layer"
          onClick={() => {
            const at = effects.length
            mutateEffects(output, (list) => {
              list.push({ type: 'solid', color: '#38BDF8' })
            })
            selectEffect(at)
          }}
        />
      ) : (
        <Hint>{`One device composes at most ${MAXIMUM_LED_EFFECTS} layers.`}</Hint>
      )}
    </Group>
  )
}
