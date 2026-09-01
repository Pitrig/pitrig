import { useEffect, useRef } from 'react'

import type { HardwareDeviceConfiguration, LedEffect } from '@shared/configuration-schema'
import { drawnSize, readMask, shapeOf, writeMask } from '@shared/led-render'
import { PropertyRow } from '@/features/configuration/inspector/PropertyRow'
import { useDeviceStore } from '@/features/device/device-store'
import { HINTS } from './hints'

const CELL = 13
const GAP = 2

function endPaint(painting: React.RefObject<boolean | null>): void {
  if (painting.current === null) return
  painting.current = null
  useDeviceStore.getState().endEdit()
}

export function PanelAreaField({
  device,
  effect,
  update
}: {
  device: HardwareDeviceConfiguration
  effect: LedEffect
  update: (mutation: (next: LedEffect) => void) => void
}): React.JSX.Element | null {
  const painting = useRef<boolean | null>(null)

  useEffect(() => {
    const stop = (): void => endPaint(painting)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      stop()
    }
  }, [])

  const shape = shapeOf(device)
  if (!shape) return null
  const drawn = drawnSize(shape)
  const pixels = drawn.width * drawn.height
  const chosen = readMask(effect.panel_mask ?? '', pixels)
  const count = chosen.filter(Boolean).length
  const everyPixel = count === pixels
  const lastPixel = count === 1

  const commit = (next: boolean[]): void =>
    update((layer) => {
      if (next.every(Boolean)) delete layer.panel_mask
      else if (next.some(Boolean)) layer.panel_mask = writeMask(next)
    })

  const toggle = (pixel: number, to: boolean): void => {
    if (chosen[pixel] === to) return
    const next = [...chosen]
    next[pixel] = to
    commit(next)
  }

  const startPaint = (to: boolean): void => {
    endPaint(painting)
    useDeviceStore.getState().beginEdit()
    painting.current = to
  }

  return (
    <PropertyRow label="Shows on" hint={HINTS.effect.panel} block>
      <div className="flex items-center gap-2 pb-1">
        <span className="text-[11px] text-muted-foreground">
          {everyPixel ? 'every pixel' : `${count} of ${pixels} pixels`}
        </span>
        <button
          type="button"
          className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-white/5"
          onClick={() => commit(Array.from({ length: pixels }, () => true))}
        >
          All
        </button>
        <button
          type="button"
          disabled={everyPixel}
          title={
            everyPixel
              ? 'Every pixel is chosen, so inverting would leave the layer nothing to paint on'
              : 'Chooses the pixels this layer is not shown on'
          }
          className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-white/5 disabled:opacity-30"
          onClick={() => commit(chosen.map((lit) => !lit))}
        >
          Invert
        </button>
      </div>
      <div
        className="w-fit max-w-full overflow-auto rounded border border-white/10 bg-black/40 p-1"
        onPointerLeave={() => endPaint(painting)}
      >
        <div
          className="grid"
          style={{ gap: GAP, gridTemplateColumns: `repeat(${drawn.width}, ${CELL}px)` }}
        >
          {Array.from({ length: drawn.height }, (_, y) =>
            Array.from({ length: drawn.width }, (_, x) => {
              const pixel = y * drawn.width + x
              const lit = chosen[pixel] ?? false
              const kept = lit && lastPixel
              return (
                <button
                  key={pixel}
                  type="button"
                  aria-pressed={lit}
                  aria-label={`Pixel ${x + 1}, ${y + 1}`}
                  disabled={kept}
                  title={kept ? 'A layer keeps at least one pixel' : undefined}
                  className={`rounded-sm ${lit ? 'bg-sky-400/80 hover:bg-sky-300' : 'bg-white/10 hover:bg-white/25'}`}
                  style={{ width: CELL, height: CELL }}
                  onPointerDown={() => {
                    startPaint(!lit)
                    toggle(pixel, !lit)
                  }}
                  onPointerEnter={() => {
                    if (painting.current !== null) toggle(pixel, painting.current)
                  }}
                />
              )
            })
          )}
        </div>
      </div>
    </PropertyRow>
  )
}
