import { useEffect, useState } from 'react'

import { paintOutput } from '@shared/led-paint'
import type { HardwareDeviceConfiguration, RgbColor } from '@shared/configuration-schema'
import { PageSection } from '@/app/workspace/PageShell'
import { playedLayersOf, type PlayedLayer } from './board-preview'
import { useLiveRevision } from '@/features/telemetry/live-telemetry'
import { previewDrive, previewNote } from './preview-values'
import { DevicePreview } from './DevicePreview'
import { layerName } from './layer-name'
import { useModulesStore } from './modules-store'
import { t } from '@shared/ui-text'

const SWEEP_MS = 4000
const TICK_MS = 33
const UNLIT: readonly RgbColor[] = []

function useElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!active) return undefined
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
  }, [active])
  return active ? elapsed : 0
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
  useLiveRevision()
  const elapsed = useElapsed(played.length > 0)
  const sweep = (elapsed % SWEEP_MS) / SWEEP_MS
  const layers = played.map(({ layer }) => layer)
  const drives = layers.map((layer) => previewDrive(layer, elapsed))

  return (
    <PageSection title={t('modules.ledPreview.preview')} description={describe(played)}>
      <DevicePreview
        device={device}
        frame={
          played.length > 0
            ? paintOutput(
                { ...device, effects: layers },
                {
                  value: sweep,
                  elapsedMs: elapsed,
                  gates: layers.map(() => true),
                  valueText: drives.map(({ valueText }) => valueText),
                  watched: drives.map(({ watched }) => watched),
                  values: drives.map(({ value }) => value)
                }
              )
            : UNLIT
        }
        highlight={highlight?.output === index ? highlight : null}
      />
    </PageSection>
  )
}

function nameOf({ target, layer }: PlayedLayer): string {
  return target.kind === 'sprite'
    ? `Picture ${target.sprite}`
    : layerName(layer, target.effect)
}

function describe(played: readonly PlayedLayer[]): string {
  const first = played[0]
  if (!first) {
    return 'Dark until a layer or a picture is played. Press the preview button on one to watch it here.'
  }
  if (played.length === 1) {
    return `${nameOf(first)} on its own, over and over.${previewNote(first.layer)} Press its button again to stop.`
  }
  return `${played.map(nameOf).join(', ')} together, over and over. Where they share a lamp the one played last wins, the way the board resolves it.`
}
