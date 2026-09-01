import { useEffect, useState } from 'react'

import { paintOutput } from '@shared/led-paint'
import type { HardwareDeviceConfiguration, RgbColor } from '@shared/configuration-schema'
import { PageSection } from '@/app/workspace/PageShell'
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
  const effects = device.effects ?? []
  const focused = preview?.output === index ? preview.effect : -1
  const alone = effects[focused]
  const elapsed = useElapsed(alone !== undefined)
  const sweep = (elapsed % SWEEP_MS) / SWEEP_MS

  return (
    <PageSection
      title="Preview"
      description={
        alone
          ? `${layerName(alone, focused)} on its own, over and over. Press its button again to stop.`
          : 'Dark until a layer is played. Press the preview button on one to watch it here.'
      }
    >
      <DevicePreview
        device={device}
        frame={
          alone
            ? paintOutput(device, {
                value: sweep,
                elapsedMs: elapsed,
                gates: effects.map((_, at) => at === focused)
              })
            : UNLIT
        }
        highlight={highlight?.output === index ? highlight : null}
      />
    </PageSection>
  )
}
