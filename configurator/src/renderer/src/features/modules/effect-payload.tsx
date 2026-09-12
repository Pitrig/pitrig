import {
  MAXIMUM_COLOR_STOPS,
  MAXIMUM_INDICATOR_SEGMENTS,
  type LedEffect
} from '@shared/configuration-schema'
import {
  ValueColorList,
  type ValueColorEntry
} from '@/features/configuration/inspector/ValueColorList'
import { Subsection } from './Subsection'
import { t } from '@shared/ui-text'

function nextStopValue(
  entries: readonly ValueColorEntry[],
  minimum: number,
  maximum: number
): number {
  const last = entries[entries.length - 1]?.value
  if (last === undefined) return minimum
  if (maximum > last) return last + (maximum - last) / 2
  const span = maximum - minimum
  return last + (span > 0 ? span / 2 : 1)
}

export function EffectPayload({
  effect,
  type,
  update
}: {
  effect: LedEffect
  type: string
  update: (mutation: (next: LedEffect) => void) => void
}): React.JSX.Element | null {
  if (type === 'steps') {
    const steps = effect.steps ?? []
    return (
      <Subsection title={t('modules.effectPayload.thresholds')}>
        <ValueColorList
          noun={t('modules.effectPayload.step')}
          valueTitle={t('modules.effectPayload.lightsAtThisFractionOf')}
          entries={steps.map((step) => ({
            value: step.threshold ?? 0,
            color: step.color ?? '#00C853'
          }))}
          capacity={MAXIMUM_INDICATOR_SEGMENTS}
          capacityNote={t('modules.effectPayload.aLayerHoldsAtMost', { maximum: MAXIMUM_INDICATOR_SEGMENTS })}
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
      </Subsection>
    )
  }

  if (type !== 'gradient' && type !== 'gauge') return null

  const stops = effect.stops ?? []
  return (
    <Subsection title={t('modules.effectPayload.colourRamp')}>
      <ValueColorList
        noun={t('modules.effectPayload.stop')}
        valueTitle={
          type === 'gradient'
            ? t('modules.effectPayload.positionAlongTheLamps0')
            : t('modules.effectPayload.valueThisColourSitsAt')
        }
        entries={stops.map((stop) => ({
          value: stop.at ?? 0,
          color: stop.color ?? '#38BDF8'
        }))}
        capacity={MAXIMUM_COLOR_STOPS}
        capacityNote={t('modules.effectPayload.aRampHoldsAtMost', { maximum: MAXIMUM_COLOR_STOPS })}
        defaultColor="#D50000"
        seedValue={(entries) =>
          type === 'gauge'
            ? nextStopValue(entries, effect.minimum ?? 0, effect.maximum ?? 1)
            : nextStopValue(entries, 0, 1)
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
    </Subsection>
  )
}
