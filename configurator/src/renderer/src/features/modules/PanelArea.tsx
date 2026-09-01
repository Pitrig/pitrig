import { useState } from 'react'

import type { HardwareDeviceConfiguration, LedEffect } from '@shared/configuration-schema'
import { drawnSize, shapeOf } from '@shared/led-render'
import { PropertyRow } from '@/features/configuration/inspector/PropertyRow'
import { HINTS } from './hints'

const CELL = 13
const GAP = 2

function readMask(mask: string, pixels: number): boolean[] {
  if (mask === '') return Array.from({ length: pixels }, () => true)
  return Array.from({ length: pixels }, (_, pixel) => {
    const value = Number.parseInt(mask[Math.floor(pixel / 4)] ?? '', 16)
    return Number.isInteger(value) && (value & (1 << (3 - (pixel % 4)))) !== 0
  })
}

function writeMask(chosen: readonly boolean[]): string {
  let mask = ''
  for (let digit = 0; digit * 4 < chosen.length; ++digit) {
    let value = 0
    for (let bit = 0; bit < 4; ++bit) {
      if (chosen[digit * 4 + bit]) value |= 1 << (3 - bit)
    }
    mask += value.toString(16)
  }
  return mask
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
  const [painting, setPainting] = useState<boolean | null>(null)
  const shape = shapeOf(device)
  if (!shape) return null
  const drawn = drawnSize(shape)
  const pixels = drawn.width * drawn.height
  const chosen = readMask(effect.panel_mask ?? '', pixels)
  const count = chosen.filter(Boolean).length

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

  return (
    <PropertyRow label="Shows on" hint={HINTS.effect.panel} block>
      <div className="flex items-center gap-2 pb-1">
        <span className="text-[11px] text-muted-foreground">
          {count === pixels ? 'every pixel' : `${count} of ${pixels} pixels`}
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
          className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-white/5"
          onClick={() => commit(chosen.map((lit) => !lit))}
        >
          Invert
        </button>
      </div>
      <div
        className="w-fit max-w-full overflow-auto rounded border border-white/10 bg-black/40 p-1"
        onPointerUp={() => setPainting(null)}
        onPointerLeave={() => setPainting(null)}
      >
        <div
          className="grid"
          style={{ gap: GAP, gridTemplateColumns: `repeat(${drawn.width}, ${CELL}px)` }}
        >
          {Array.from({ length: drawn.height }, (_, y) =>
            Array.from({ length: drawn.width }, (_, x) => {
              const pixel = y * drawn.width + x
              const lit = chosen[pixel] ?? false
              return (
                <button
                  key={pixel}
                  type="button"
                  aria-pressed={lit}
                  aria-label={`Pixel ${x + 1}, ${y + 1}`}
                  className={`rounded-sm ${lit ? 'bg-sky-400/80 hover:bg-sky-300' : 'bg-white/10 hover:bg-white/25'}`}
                  style={{ width: CELL, height: CELL }}
                  onPointerDown={() => {
                    setPainting(!lit)
                    toggle(pixel, !lit)
                  }}
                  onPointerEnter={() => {
                    if (painting !== null) toggle(pixel, painting)
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
