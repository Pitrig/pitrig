import type {
  HardwareDeviceConfiguration,
  LedEffect,
  LedSegmentDirection,
  RgbColor
} from './configuration-schema'

export interface MatrixShape {
  width: number
  height: number
  order: 'progressive' | 'serpentine'
  origin: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right'
  rotation: number
}

export const OFF: RgbColor = '#000000'

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

export interface LampArea {
  x: number
  y: number
  width: number
  height: number
  mask?: string
  stride?: number
}

export function maskHolds(area: LampArea, column: number, row: number): boolean {
  if (!area.mask) return true
  const pixel = (area.y + row) * (area.stride ?? area.width) + (area.x + column)
  const value = Number.parseInt(area.mask[Math.floor(pixel / 4)] ?? '', 16)
  return Number.isInteger(value) && (value & (1 << (3 - (pixel % 4)))) !== 0
}

export function deviceShape(device: HardwareDeviceConfiguration): MatrixShape {
  return (
    shapeOf(device) ?? {
      width: device.count ?? 1,
      height: 1,
      order: 'progressive',
      origin: 'top_left',
      rotation: 0
    }
  )
}

export function areaOf(
  device: HardwareDeviceConfiguration,
  effect: LedEffect
): LampArea | undefined {
  const drawn = drawnSize(deviceShape(device))
  if (drawn.width === 0 || drawn.height === 0) return undefined
  if (drawn.height === 1) {
    const from = effect.from ?? 0
    if (from >= drawn.width) return undefined
    const available = drawn.width - from
    const asked = effect.count ?? 0
    const count = asked === 0 ? available : Math.min(asked, available)
    return count === 0 ? undefined : { x: from, y: 0, width: count, height: 1 }
  }
  const mask = effect.panel_mask ?? ''
  if (mask === '') return { x: 0, y: 0, width: drawn.width, height: drawn.height }
  const whole: LampArea = { x: 0, y: 0, ...drawn, mask, stride: drawn.width }
  let left = drawn.width
  let top = drawn.height
  let right = -1
  let bottom = -1
  for (let row = 0; row < drawn.height; ++row) {
    for (let column = 0; column < drawn.width; ++column) {
      if (!maskHolds(whole, column, row)) continue
      left = Math.min(left, column)
      top = Math.min(top, row)
      right = Math.max(right, column)
      bottom = Math.max(bottom, row)
    }
  }
  if (right < left || bottom < top) return undefined
  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
    mask,
    stride: drawn.width
  }
}

export interface StripLayout {
  positions: readonly { x: number; y: number }[]
  width: number
  height: number
}

export interface SegmentBounds {
  start: number
  end: number
}

interface Step {
  x: number
  y: number
}

const SEGMENT_STEP: Record<LedSegmentDirection, Step> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 }
}

function turnStep(previous: Step | undefined, next: Step): Step {
  if (!previous) return next
  if (previous.x === next.x && previous.y === next.y) return next
  if (previous.x === -next.x && previous.y === -next.y) {
    return next.y === 0 ? SEGMENT_STEP.down : SEGMENT_STEP.right
  }
  return { x: previous.x + next.x, y: previous.y + next.y }
}

export function segmentBoundsOf(device: HardwareDeviceConfiguration): SegmentBounds[] {
  const bounds: SegmentBounds[] = []
  let start = 0
  for (const segment of device.segments ?? []) {
    const count = Math.max(1, segment.count ?? 1)
    bounds.push({ start, end: start + count - 1 })
    start += count
  }
  return bounds
}

export function stripLayout(device: HardwareDeviceConfiguration): StripLayout | undefined {
  if (isMatrix(device) || (device.segments ?? []).length === 0) return undefined
  const total = lampsOf(device)
  const positions: { x: number; y: number }[] = []
  let x = 0
  let y = 0
  let step = SEGMENT_STEP.right
  let previous: Step | undefined
  for (const segment of device.segments ?? []) {
    step = SEGMENT_STEP[segment.direction ?? 'right']
    const count = Math.max(1, segment.count ?? 1)
    for (let lamp = 0; lamp < count && positions.length < total; ++lamp) {
      if (positions.length > 0) {
        const move = lamp === 0 ? turnStep(previous, step) : step
        x += move.x
        y += move.y
      }
      positions.push({ x, y })
    }
    previous = step
  }
  while (positions.length < total) {
    x += step.x
    y += step.y
    positions.push({ x, y })
  }
  const minX = Math.min(...positions.map((at) => at.x))
  const minY = Math.min(...positions.map((at) => at.y))
  const shifted = positions.map((at) => ({ x: at.x - minX, y: at.y - minY }))
  return {
    positions: shifted,
    width: Math.max(...shifted.map((at) => at.x)) + 1,
    height: Math.max(...shifted.map((at) => at.y)) + 1
  }
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
