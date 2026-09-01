import { memo, useMemo } from 'react'

import {
  drawnSize,
  matrixLamp,
  shapeOf,
  stripLayout,
  OFF,
  type MatrixShape
} from '@shared/led-render'
import type { HardwareDeviceConfiguration, RgbColor } from '@shared/configuration-schema'

const LAMP = 14
const GAP = 3
const CELL = LAMP + GAP

const Lamp = memo(function Lamp({
  color,
  title,
  marked
}: {
  color: RgbColor
  title: string
  marked: boolean
}): React.JSX.Element {
  return (
    <span
      title={title}
      className={`inline-block rounded-full ring-1 ring-inset ${
        marked ? 'ring-2 ring-sky-400' : 'ring-white/15'
      }`}
      style={{
        width: LAMP,
        height: LAMP,
        background: color,
        boxShadow: color !== OFF ? `0 0 ${LAMP / 2}px ${color}` : 'none'
      }}
    />
  )
})

export interface LampRangeHighlight {
  from: number
  count: number
}

interface MatrixGrid {
  columns: number
  rows: readonly (readonly number[])[]
}

interface LampPlace {
  lamp: number
  style: { left: number; top: number }
}

interface StripPlacement {
  box: { width: number; height: number }
  places: readonly LampPlace[]
}

function matrixGrid(shape: MatrixShape | undefined): MatrixGrid | undefined {
  if (!shape) return undefined
  const size = drawnSize(shape)
  return {
    columns: size.width,
    rows: Array.from({ length: size.height }, (_, y) =>
      Array.from({ length: size.width }, (_, x) => matrixLamp(shape, x, y))
    )
  }
}

function stripPlacement(device: HardwareDeviceConfiguration): StripPlacement | undefined {
  const layout = stripLayout(device)
  if (!layout) return undefined
  return {
    box: { width: layout.width * CELL + GAP, height: layout.height * CELL + GAP },
    places: layout.positions.map((position, lamp) => ({
      lamp,
      style: { left: position.x * CELL + GAP, top: position.y * CELL + GAP }
    }))
  }
}

export function DevicePreview({
  device,
  frame,
  highlight
}: {
  device: HardwareDeviceConfiguration
  frame: readonly RgbColor[]
  highlight?: LampRangeHighlight | null
}): React.JSX.Element {
  const { type, count, segments, width, height, order, origin, rotation_deg } = device
  const { grid, strip } = useMemo(
    () => ({ grid: matrixGrid(shapeOf(device)), strip: stripPlacement(device) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, count, segments, width, height, order, origin, rotation_deg]
  )
  const at = (lamp: number): RgbColor => frame[lamp] ?? OFF
  const marked = (lamp: number): boolean =>
    highlight != null && lamp >= highlight.from && lamp < highlight.from + highlight.count
  if (grid) {
    return (
      <div
        className="grid w-fit gap-[3px] rounded border border-white/10 bg-black/50 p-1"
        style={{ gridTemplateColumns: `repeat(${grid.columns}, ${LAMP}px)` }}
      >
        {grid.rows.map((row, y) =>
          row.map((lamp, x) => (
            <Lamp
              key={`${x}-${y}`}
              color={at(lamp)}
              title={`lamp ${lamp + 1}`}
              marked={marked(lamp)}
            />
          ))
        )}
      </div>
    )
  }
  if (strip) {
    return (
      <div className="max-w-full overflow-auto">
        <div className="relative rounded border border-white/10 bg-black/50" style={strip.box}>
          {strip.places.map((place) => (
            <span key={place.lamp} className="absolute" style={place.style}>
              <Lamp
                color={at(place.lamp)}
                title={`lamp ${place.lamp + 1}`}
                marked={marked(place.lamp)}
              />
            </span>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div
      className="flex w-fit flex-wrap rounded border border-white/10 bg-black/50 p-1"
      style={{ gap: GAP, maxWidth: `min(100%, ${CELL * 32}px)` }}
    >
      {Array.from({ length: count ?? 1 }, (_, lamp) => (
        <Lamp key={lamp} color={at(lamp)} title={`lamp ${lamp + 1}`} marked={marked(lamp)} />
      ))}
    </div>
  )
}
