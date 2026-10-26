import type { HardwareDeviceConfiguration, LedEffect } from '@shared/configuration-schema'
import { drawnSize, readMask, shapeOf, writeMask } from '@shared/led-render'

export function withPanelPixel(
  effect: LedEffect,
  device: HardwareDeviceConfiguration,
  pixel: number,
  on: boolean
): void {
  const shape = shapeOf(device)
  if (!shape) return
  const drawn = drawnSize(shape)
  const chosen = readMask(effect.panel_mask ?? '', drawn.width * drawn.height)
  if (chosen[pixel] === on || pixel < 0 || pixel >= chosen.length) return
  chosen[pixel] = on
  if (chosen.every(Boolean)) delete effect.panel_mask
  else if (chosen.some(Boolean)) effect.panel_mask = writeMask(chosen)
}
