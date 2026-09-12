import { useEffect, useState } from 'react'

import { paintOutput } from '@shared/led-paint'
import { newRuleState, type LedRuleState } from '@shared/led-colors'
import type { HardwareDeviceConfiguration, RgbColor } from '@shared/configuration-schema'
import { PageSection } from '@/app/workspace/PageShell'
import { playedLayersOf, type PlayedLayer } from './board-preview'
import { useLiveRevision } from '@/features/telemetry/live-telemetry'
import { previewDrive, previewNote } from './preview-values'
import { DevicePreview } from './DevicePreview'
import { layerName } from './layer-name'
import { useModulesStore, type LampHighlight } from './modules-store'
import { t } from '@shared/ui-text'

const SWEEP_MS = 4000
const TICK_MS = 33
const UNLIT: readonly RgbColor[] = []

function useElapsed(): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const started = performance.now()
    let frame = 0
    let shown = -TICK_MS
    const step = (time: number): void => {
      const since = time - started
      if (since - shown >= TICK_MS) {
        shown = since
        setElapsed(since)
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [])
  return elapsed
}

export function LedPreview({
  index,
  device
}: {
  index: number
  device: HardwareDeviceConfiguration
}): React.JSX.Element {
  const highlight = useModulesStore((state) => state.highlight)
  const preview = useModulesStore((state) => state.preview)
  const played = playedLayersOf(
    device,
    preview.filter((entry) => entry.output === index)
  )
  const marked = highlight?.output === index ? highlight : null

  return (
    <PageSection title={t('modules.ledPreview.preview')} description={describe(played)}>
      {played.length > 0 ? (
        <PlayedPreview
          key={played.length}
          device={device}
          played={played}
          highlight={marked}
        />
      ) : (
        <DevicePreview device={device} frame={UNLIT} highlight={marked} />
      )}
    </PageSection>
  )
}

function PlayedPreview({
  device,
  played,
  highlight
}: {
  device: HardwareDeviceConfiguration
  played: readonly PlayedLayer[]
  highlight: LampHighlight | null
}): React.JSX.Element {
  useLiveRevision()
  const elapsed = useElapsed()
  const [states] = useState<LedRuleState[]>(() => played.map(() => newRuleState()))
  const layers = played.map(({ layer }) => layer)
  const drives = layers.map((layer) => previewDrive(layer, elapsed))

  return (
    <DevicePreview
      device={device}
      frame={paintOutput(
        { ...device, effects: layers },
        {
          value: (elapsed % SWEEP_MS) / SWEEP_MS,
          elapsedMs: elapsed,
          gates: layers.map(() => true),
          valueText: drives.map(({ valueText }) => valueText),
          watched: drives.map(({ watched }) => watched),
          values: drives.map(({ value }) => value),
          states
        }
      )}
      highlight={highlight}
    />
  )
}

function nameOf({ target, layer }: PlayedLayer): string {
  return target.kind === 'sprite'
    ? t('modules.ledPreview.pictureSprite', { sprite: target.sprite ?? '' })
    : layerName(layer, target.effect)
}

function describe(played: readonly PlayedLayer[]): string {
  const first = played[0]
  if (!first) {
    return t('modules.ledPreview.darkUntilALayerOr')
  }
  if (played.length === 1) {
    return t('modules.ledPreview.nameOnItsOwnOver', {
      name: nameOf(first),
      note: previewNote(first.layer)
    })
  }
  return t('modules.ledPreview.namesTogetherOverAndOver', { names: played.map(nameOf).join(', ') })
}
