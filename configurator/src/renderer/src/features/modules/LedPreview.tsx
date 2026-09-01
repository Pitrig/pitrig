import { useEffect, useState } from 'react'
import { Pause, Play } from 'lucide-react'

import { paintOutput } from '@shared/led-paint'
import type { HardwareDeviceConfiguration } from '@shared/configuration-schema'
import { PageSection } from '@/app/workspace/PageShell'
import { DevicePreview } from './DevicePreview'
import { useModulesStore } from './modules-store'

const SWEEP_MS = 4000
const TICK_MS = 33

function useElapsed(playing: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!playing) return undefined
    let frame = 0
    let previous = performance.now()
    let pending = 0
    const step = (time: number): void => {
      pending += time - previous
      previous = time
      if (pending >= TICK_MS) {
        const delta = pending
        pending = 0
        setElapsed((value) => value + delta)
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [playing])
  return elapsed
}

export function LedPreview({
  index,
  device
}: {
  index: number
  device: HardwareDeviceConfiguration
}): React.JSX.Element {
  const playing = useModulesStore((state) => state.playing)
  const togglePlaying = useModulesStore((state) => state.togglePlaying)
  const manual = useModulesStore((state) => state.value)
  const setValue = useModulesStore((state) => state.setValue)
  const gates = useModulesStore((state) => state.gates)
  const elapsed = useElapsed(playing)
  const sweep = playing ? (elapsed % SWEEP_MS) / SWEEP_MS : manual

  return (
    <PageSection
      title="Preview"
      description="Placeholder values, not the board. Every bound layer reads the same sweep."
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={playing ? 'Pause the sweep' : 'Play the sweep'}
            className="rounded border p-1 hover:bg-white/5"
            onClick={togglePlaying}
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </button>
          <input
            aria-label="Preview value"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sweep}
            onChange={(event) => setValue(Number(event.target.value))}
            className="w-40"
          />
          <span className="w-10 text-right text-[11px] text-muted-foreground">
            {Math.round(sweep * 100)}%
          </span>
        </div>
      }
    >
      <DevicePreview
        device={device}
        frame={paintOutput(device, {
          value: sweep,
          elapsedMs: elapsed,
          gates: (device.effects ?? []).map((_, at) => gates[`${index}:${at}`] !== false)
        })}
      />
    </PageSection>
  )
}
