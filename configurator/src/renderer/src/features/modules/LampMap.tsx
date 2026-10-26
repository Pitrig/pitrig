import { memo, useMemo } from 'react'

import { drawnSize, matrixLamp, shapeOf, stripLayout, OFF } from '@shared/led-render'
import { t } from '@shared/ui-text'
import type { HardwareDeviceConfiguration, RgbColor } from '@shared/configuration-schema'

export type LampMark = 'none' | 'selected' | 'pending'

const MARK_OUTLINE: Record<LampMark, string> = {
  none: 'none',
  selected: '2px solid #38BDF8',
  pending: '2px dashed #FCD34D'
}

interface Geometry {
  lamp: number
  gap: number
  places: readonly { lamp: number; left: number; top: number }[]
  width: number
  height: number
}

function luminance(color: RgbColor): number {
  const channel = (at: number): number => Number.parseInt(color.slice(at, at + 2), 16) / 255
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

const Lamp = memo(function Lamp({
  color,
  index,
  mark,
  size,
  onDown,
  onEnter
}: {
  color: RgbColor
  index: number
  mark: LampMark
  size: number
  onDown?: (lamp: number, event: React.PointerEvent) => void
  onEnter?: (lamp: number) => void
}): React.JSX.Element {
  const number = index + 1
  const lit = color !== OFF
  return (
    <span
      role="img"
      aria-label={t('modules.devicePreview.lampNumber', { number })}
      data-mark={mark}
      className="flex select-none items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: color,
        border: '1px solid rgba(255,255,255,0.15)',
        outline: MARK_OUTLINE[mark],
        outlineOffset: 2,
        boxShadow: lit ? `0 0 ${size / 2}px ${color}` : 'none',
        color: !lit ? 'rgba(255,255,255,0.45)' : luminance(color) > 0.55 ? '#111' : '#fff',
        fontSize: number >= 100 ? 9 : 10
      }}
      onPointerDown={(event) => onDown?.(index, event)}
      onPointerEnter={() => onEnter?.(index)}
    >
      {number}
    </span>
  )
})

function lampSize(device: HardwareDeviceConfiguration): number {
  const shape = shapeOf(device)
  if (!shape) return 26
  const columns = drawnSize(shape).width
  return columns <= 8 ? 30 : columns <= 12 ? 26 : 22
}

function geometryOf(device: HardwareDeviceConfiguration): Geometry {
  const lamp = lampSize(device)
  const shape = shapeOf(device)
  if (shape) {
    const gap = 4
    const drawn = drawnSize(shape)
    const places = Array.from({ length: drawn.height }, (_, y) =>
      Array.from({ length: drawn.width }, (_, x) => ({
        lamp: matrixLamp(shape, x, y),
        left: gap + x * (lamp + gap),
        top: gap + y * (lamp + gap)
      }))
    ).flat()
    return {
      lamp,
      gap,
      places,
      width: gap + drawn.width * (lamp + gap),
      height: gap + drawn.height * (lamp + gap)
    }
  }
  const gap = 6
  const layout = stripLayout(device)
  if (layout) {
    return {
      lamp,
      gap,
      places: layout.positions.map((position, index) => ({
        lamp: index,
        left: gap + position.x * (lamp + gap),
        top: gap + position.y * (lamp + gap)
      })),
      width: gap + layout.width * (lamp + gap),
      height: gap + layout.height * (lamp + gap)
    }
  }
  return { lamp, gap, places: [], width: 0, height: 0 }
}

export function LampMap({
  device,
  frame,
  mark,
  onLampDown,
  onLampEnter,
  onLeave
}: {
  device: HardwareDeviceConfiguration
  frame: readonly RgbColor[]
  mark: (lamp: number) => LampMark
  onLampDown?: (lamp: number, event: React.PointerEvent) => void
  onLampEnter?: (lamp: number) => void
  onLeave?: () => void
}): React.JSX.Element {
  const { type, count, segments, width, height, order, origin, rotation_deg } = device
  const geometry = useMemo(
    () => geometryOf(device),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, count, segments, width, height, order, origin, rotation_deg]
  )
  const lamp = (index: number): React.JSX.Element => (
    <Lamp
      color={frame[index] ?? OFF}
      index={index}
      mark={mark(index)}
      size={geometry.lamp}
      onDown={onLampDown}
      onEnter={onLampEnter}
    />
  )
  if (geometry.places.length === 0) {
    return (
      <div
        className="flex w-fit max-w-full flex-wrap rounded-md border border-white/10 bg-black/60 p-1.5"
        style={{ gap: geometry.gap }}
        onPointerLeave={onLeave}
      >
        {Array.from({ length: count ?? 1 }, (_, index) => (
          <span key={index}>{lamp(index)}</span>
        ))}
      </div>
    )
  }
  return (
    <div className="max-w-full overflow-auto">
      <div
        className="relative rounded-md border border-white/10 bg-black/60"
        style={{ width: geometry.width, height: geometry.height }}
        onPointerLeave={onLeave}
      >
        {geometry.places.map((place) => (
          <span key={place.lamp} className="absolute" style={{ left: place.left, top: place.top }}>
            {lamp(place.lamp)}
          </span>
        ))}
      </div>
    </div>
  )
}
