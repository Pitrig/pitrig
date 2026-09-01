import type { HardwareDeviceConfiguration, RgbColor } from './configuration-schema'

export interface MatrixShape {
  width: number
  height: number
  order: 'progressive' | 'serpentine'
  origin: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right'
  rotation: number
}

export const OFF: RgbColor = '#000000'

export function scaledColor(color: RgbColor, brightness: number): RgbColor {
  if (brightness >= 255) return color
  const channel = (at: number): number =>
    Math.floor((Number.parseInt(color.slice(at, at + 2), 16) * brightness + 127) / 255)
  const hex = (value: number): string => value.toString(16).padStart(2, '0')
  return `#${hex(channel(1))}${hex(channel(3))}${hex(channel(5))}` as RgbColor
}

export const LED_EFFECT_DRAWS_PIXELS: ReadonlySet<string> = new Set(['sprite', 'text'])
export const LED_EFFECT_READS_VALUE: ReadonlySet<string> = new Set([
  'steps',
  'gauge',
  'sprite',
  'text'
])
export const LED_EFFECT_NEEDS_VALUE: ReadonlySet<string> = new Set(['steps', 'gauge'])
export const LED_EFFECT_USES_RANGE: ReadonlySet<string> = new Set(['steps', 'gauge'])

export function isMatrix(device: HardwareDeviceConfiguration): boolean {
  return device.type === 'rgb_matrix'
}

export function shapeOf(device: HardwareDeviceConfiguration): MatrixShape | undefined {
  if (!isMatrix(device)) return undefined
  return {
    width: device.width ?? 8,
    height: device.height ?? 8,
    order: device.order ?? 'serpentine',
    origin: device.origin ?? 'top_left',
    rotation: device.rotation_deg ?? 0
  }
}

export function lampsOf(device: HardwareDeviceConfiguration): number {
  const shape = shapeOf(device)
  return shape ? shape.width * shape.height : (device.count ?? 1)
}

export function drawnSize(shape: MatrixShape): { width: number; height: number } {
  return shape.rotation === 90 || shape.rotation === 270
    ? { width: shape.height, height: shape.width }
    : { width: shape.width, height: shape.height }
}

export function matrixLamp(shape: MatrixShape, x: number, y: number): number {
  const drawn = drawnSize(shape)
  if (x < 0 || y < 0 || x >= drawn.width || y >= drawn.height) return -1
  let px = x
  let py = y
  if (shape.rotation === 90) {
    const rx = py
    py = shape.height - 1 - px
    px = rx
  } else if (shape.rotation === 180) {
    px = shape.width - 1 - px
    py = shape.height - 1 - py
  } else if (shape.rotation === 270) {
    const rx = shape.width - 1 - py
    py = px
    px = rx
  }
  if (shape.origin === 'top_right' || shape.origin === 'bottom_right') {
    px = shape.width - 1 - px
  }
  if (shape.origin === 'bottom_left' || shape.origin === 'bottom_right') {
    py = shape.height - 1 - py
  }
  const reversed = shape.order === 'serpentine' && py % 2 === 1
  return py * shape.width + (reversed ? shape.width - 1 - px : px)
}
