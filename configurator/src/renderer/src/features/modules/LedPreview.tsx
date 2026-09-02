import { useEffect, useState } from 'react'

import { paintOutput } from '@shared/led-paint'
import type { HardwareDeviceConfiguration, RgbColor } from '@shared/configuration-schema'
import { PageSection } from '@/app/workspace/PageShell'
import { previewLayerOf } from './board-preview'
import { previewDrive, previewNote } from './preview-values'
import { DevicePreview } from './DevicePreview'
import { layerName } from './layer-name'
import { useModulesStore } from './modules-store'

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
  const target = preview?.output === index ? preview : null
  const alone = target ? previewLayerOf(device, target) : undefined
  const elapsed = useElapsed(alone !== undefined)
  const sweep = (elapsed % SWEEP_MS) / SWEEP_MS
  const solo = alone ? { ...device, effects: [alone] } : device
  const named =
    target?.kind === 'sprite'
      ? `Picture ${target.sprite}`
      : alone
        ? layerName(alone, target?.kind === 'layer' ? target.effect : 0)
        : ''

  return (
    <PageSection
      title="Preview"
      description={
        alone
          ? `${named} on its own, over and over.${previewNote(alone)} Press its button again to stop.`
          : 'Dark until a layer or a picture is played. Press the preview button on one to watch it here.'
      }
    >
      <DevicePreview
        device={device}
        frame={
          alone
            ? paintOutput(solo, {
                value: sweep,
                elapsedMs: elapsed,
                gates: [true],
                ...previewDrive(alone, elapsed)
              })
            : UNLIT
        }
        highlight={highlight?.output === index ? highlight : null}
      />
    </PageSection>
  )
}
