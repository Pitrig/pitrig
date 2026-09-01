import { memo } from 'react'

import { drawnSize, matrixLamp, shapeOf, stripLayout, OFF } from '@shared/led-render'
import type { HardwareDeviceConfiguration, RgbColor } from '@shared/configuration-schema'

const LAMP = 14
const GAP = 3

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

export function DevicePreview({
  device,
  frame,
  highlight
}: {
  device: HardwareDeviceConfiguration
  frame: readonly RgbColor[]
  highlight?: LampRangeHighlight | null
}): React.JSX.Element {
  const shape = shapeOf(device)
  const at = (lamp: number): RgbColor => frame[lamp] ?? OFF
  const marked = (lamp: number): boolean =>
    highlight != null && lamp >= highlight.from && lamp < highlight.from + highlight.count
  if (shape) {
    const size = drawnSize(shape)
    return (
      <div
        className="grid w-fit gap-[3px] rounded border border-white/10 bg-black/50 p-1"
        style={{ gridTemplateColumns: `repeat(${size.width}, ${LAMP}px)` }}
      >
        {Array.from({ length: size.height }, (_, y) =>
          Array.from({ length: size.width }, (_, x) => {
            const lamp = matrixLamp(shape, x, y)
            return (
              <Lamp
                key={`${x}-${y}`}
                color={at(lamp)}
                title={`lamp ${lamp + 1}`}
                marked={marked(lamp)}
              />
            )
          })
        )}
      </div>
    )
  }
  const layout = stripLayout(device)
  if (layout) {
    const cell = LAMP + GAP
    return (
      <div className="max-w-full overflow-auto">
        <div
          className="relative rounded border border-white/10 bg-black/50"
          style={{ width: layout.width * cell + GAP, height: layout.height * cell + GAP }}
        >
          {layout.positions.map((position, lamp) => (
            <span
              key={lamp}
              className="absolute"
              style={{ left: position.x * cell + GAP, top: position.y * cell + GAP }}
            >
              <Lamp color={at(lamp)} title={`lamp ${lamp + 1}`} marked={marked(lamp)} />
            </span>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div
      className="flex w-fit flex-wrap rounded border border-white/10 bg-black/50 p-1"
      style={{ gap: GAP, maxWidth: `min(100%, ${(LAMP + GAP) * 32}px)` }}
    >
      {Array.from({ length: device.count ?? 1 }, (_, lamp) => (
        <Lamp key={lamp} color={at(lamp)} title={`lamp ${lamp + 1}`} marked={marked(lamp)} />
      ))}
    </div>
  )
}
