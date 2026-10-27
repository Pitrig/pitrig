import type { HardwareDeviceConfiguration, LedEffect, LedPart, RgbColor } from './configuration-schema'
import {
  areaOf,
  deviceShape,
  matrixLamp,
  maskHolds,
  type LampArea,
  type MatrixShape
} from './led-render'

export interface Surface {
  frame: RgbColor[]
  shape: MatrixShape
  area: LampArea
  parts: readonly LedPart[]
  count: number
  inverted: boolean
  mirrored: boolean
}

export function surfaceSize(surface: Surface): number {
  return surface.mirrored ? Math.ceil(surface.count / 2) : surface.count
}

function put(surface: Surface, offset: number, color: RgbColor): void {
  if (surface.parts.length > 0) {
    let remaining = offset
    for (const part of surface.parts) {
      const count = part.count ?? 1
      if (remaining < count) {
        const lamp = (part.from ?? 0) + (part.reversed ? count - 1 - remaining : remaining)
        if (lamp >= 0 && lamp < surface.frame.length) surface.frame[lamp] = color
        return
      }
      remaining -= count
    }
    return
  }
  const column = offset % surface.area.width
  const row = Math.floor(offset / surface.area.width)
  if (!maskHolds(surface.area, column, row)) return
  const lamp = matrixLamp(surface.shape, surface.area.x + column, surface.area.y + row)
  if (lamp >= 0 && lamp < surface.frame.length) surface.frame[lamp] = color
}

export function place(surface: Surface, index: number, color: RgbColor): void {
  if (index >= surfaceSize(surface)) return
  if (!surface.mirrored) {
    put(surface, surface.inverted ? surface.count - 1 - index : index, color)
    return
  }
  const half = surfaceSize(surface)
  put(surface, surface.inverted ? index : half - 1 - index, color)
  put(surface, surface.inverted ? surface.count - 1 - index : surface.count - half + index, color)
}

function lampsIn(parts: readonly LedPart[]): number {
  return parts.reduce((total, part) => total + (part.count ?? 1), 0)
}

export function surfacesOf(
  device: HardwareDeviceConfiguration,
  effect: LedEffect,
  frame: RgbColor[]
): Surface[] {
  const area = areaOf(device, effect)
  if (!area) return []
  const base = {
    frame,
    shape: deviceShape(device),
    area,
    inverted: effect.inverted ?? false,
    mirrored: effect.mirrored ?? false
  }
  const parts = device.type === 'rgb_strip' ? (effect.parts ?? []) : []
  if (parts.length === 0) return [{ ...base, parts: [], count: area.width * area.height }]
  if ((effect.layout ?? 'joined') === 'each') {
    return parts.map((part) => ({ ...base, parts: [part], count: part.count ?? 1 }))
  }
  return [{ ...base, parts, count: lampsIn(parts) }]
}

export function fillLayer(
  frame: RgbColor[],
  device: HardwareDeviceConfiguration,
  effect: LedEffect,
  color: RgbColor
): void {
  const parts = device.type === 'rgb_strip' ? (effect.parts ?? []) : []
  if (parts.length > 0) {
    for (const part of parts) {
      for (let lamp = 0; lamp < (part.count ?? 1); ++lamp) {
        const at = (part.from ?? 0) + lamp
        if (at < frame.length) frame[at] = color
      }
    }
    return
  }
  const area = areaOf(device, effect)
  if (!area) return
  const shape = deviceShape(device)
  for (let row = 0; row < area.height; ++row) {
    for (let column = 0; column < area.width; ++column) {
      if (!maskHolds(area, column, row)) continue
      const lamp = matrixLamp(shape, area.x + column, area.y + row)
      if (lamp >= 0 && lamp < frame.length) frame[lamp] = color
    }
  }
}
