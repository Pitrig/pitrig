import {
  MAXIMUM_COLOR_STOPS,
  MAXIMUM_INDICATOR_SEGMENTS,
  type LedEffect
} from '@shared/configuration-schema'
import { Group } from '@/features/configuration/inspector/Group'
import { GROUP_ICONS } from '@/features/configuration/inspector/icons'
import {
  ValueColorList,
  type ValueColorEntry
} from '@/features/configuration/inspector/ValueColorList'

export function EffectPayload({
  effect,
  type,
  update
}: {
  effect: LedEffect
  type: string
  update: (mutation: (next: LedEffect) => void) => void
}): React.JSX.Element {
  const stops = effect.stops ?? []
  const steps = effect.steps ?? []
  return (
    <>
      {type === 'steps' ? (
        <Group id="LedSteps" title="Thresholds" icon={GROUP_ICONS.segments} summary={`${steps.length} step(s)`} defaultOpen>
          <ValueColorList
            noun="step"
            valueTitle="Lights at this fraction of the range"
            entries={steps.map((step) => ({
              value: step.threshold ?? 0,
              color: step.color ?? '#00C853'
            }))}
            capacity={MAXIMUM_INDICATOR_SEGMENTS}
            capacityNote={`A layer holds at most ${MAXIMUM_INDICATOR_SEGMENTS} steps.`}
            defaultColor="#00C853"
            seedValue={(entries) => entries.length / (entries.length + 1)}
            onChange={(entries: readonly ValueColorEntry[]) =>
              update((next) => {
                next.steps = entries.map((entry) => ({
                  threshold: entry.value,
                  color: entry.color
                }))
              })
            }
          />
        </Group>
      ) : null}

      {type === 'gradient' || type === 'gauge' ? (
        <Group id="LedRamp" title="Colour ramp" icon={GROUP_ICONS.data} summary={`${stops.length} stop(s)`} defaultOpen>
          <ValueColorList
            noun="stop"
            valueTitle={type === 'gradient' ? 'Position along the lamps, 0 to 1' : 'Value this colour sits at'}
            entries={stops.map((stop) => ({
              value: stop.at ?? 0,
              color: stop.color ?? '#38BDF8'
            }))}
            capacity={MAXIMUM_COLOR_STOPS}
            capacityNote={`A ramp holds at most ${MAXIMUM_COLOR_STOPS} stops.`}
            defaultColor="#D50000"
            seedValue={(entries) =>
              entries.length === 0 ? 0 : Math.min((entries[entries.length - 1]?.value ?? 0) + 1, 1)
            }
            onChange={(entries: readonly ValueColorEntry[]) =>
              update((next) => {
                next.stops = entries.map((entry) => ({
                  at: entry.value,
                  color: entry.color
                }))
              })
            }
          />
        </Group>
      ) : null}

    </>
  )
}
