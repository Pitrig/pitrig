import type { HardwareDeviceConfiguration, LedEffect, LedPart } from '@shared/configuration-schema'
import { partLamps, wholeRun } from '@shared/led-parts'
import {
  areaOf,
  deviceShape,
  drawnSize,
  lampsOf,
  matrixLamp,
  maskHolds,
  shapeOf
} from '@shared/led-render'

export function lampsOfLayer(
  device: HardwareDeviceConfiguration,
  effect: LedEffect
): ReadonlySet<number> {
  const lamps = new Set<number>()
  const parts = device.type === 'rgb_strip' ? (effect.parts ?? []) : []
  if (parts.length > 0) {
    const total = lampsOf(device)
    for (const part of parts) {
      for (const lamp of partLamps(part)) if (lamp < total) lamps.add(lamp)
    }
    return lamps
  }
  const area = areaOf(device, effect)
  if (!area) return lamps
  const shape = deviceShape(device)
  for (let row = 0; row < area.height; ++row) {
    for (let column = 0; column < area.width; ++column) {
      if (!maskHolds(area, column, row)) continue
      const lamp = matrixLamp(shape, area.x + column, area.y + row)
      if (lamp >= 0) lamps.add(lamp)
    }
  }
  return lamps
}

export function zoneLamps(
  device: HardwareDeviceConfiguration,
  parts: readonly LedPart[] | undefined
): ReadonlySet<number> {
  return new Set((parts ?? wholeRun(lampsOf(device))).flatMap(partLamps))
}

export function panelPixelOf(device: HardwareDeviceConfiguration, lamp: number): number | undefined {
  const shape = shapeOf(device)
  if (!shape) return undefined
  const drawn = drawnSize(shape)
  for (let y = 0; y < drawn.height; ++y) {
    for (let x = 0; x < drawn.width; ++x) {
      if (matrixLamp(shape, x, y) === lamp) return y * drawn.width + x
    }
  }
  return undefined
}

export function coverageOf(device: HardwareDeviceConfiguration): readonly ReadonlySet<number>[] {
  return (device.effects ?? []).map((effect) => lampsOfLayer(device, effect))
}

export function unionOf(sets: readonly ReadonlySet<number>[]): ReadonlySet<number> {
  const union = new Set<number>()
  for (const set of sets) for (const lamp of set) union.add(lamp)
  return union
}

export function overlaps(first: ReadonlySet<number>, second: ReadonlySet<number>): boolean {
  for (const lamp of first) if (second.has(lamp)) return true
  return false
}

export function contains(outer: ReadonlySet<number>, inner: ReadonlySet<number>): boolean {
  for (const lamp of inner) if (!outer.has(lamp)) return false
  return inner.size > 0
}

export function runLabel(lamps: ReadonlySet<number>): string {
  const sorted = [...lamps].sort((first, second) => first - second)
  const runs: string[] = []
  for (let start = 0; start < sorted.length; ) {
    let end = start
    while (end + 1 < sorted.length && sorted[end + 1] === (sorted[end] as number) + 1) ++end
    const first = (sorted[start] as number) + 1
    const last = (sorted[end] as number) + 1
    runs.push(first === last ? `${first}` : `${first}–${last}`)
    start = end + 1
  }
  return runs.join(', ')
}
