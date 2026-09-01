import { memo } from 'react'

import { drawnSize, matrixLamp, shapeOf, OFF } from '@shared/led-render'
import type { HardwareDeviceConfiguration, RgbColor } from '@shared/configuration-schema'

const LAMP = 14
const GAP = 3

const Lamp = memo(function Lamp({
  color,
  title
}: {
  color: RgbColor
  title: string
}): React.JSX.Element {
  return (
    <span
      title={title}
      className="inline-block rounded-full ring-1 ring-inset ring-white/15"
      style={{
        width: LAMP,
        height: LAMP,
        background: color,
        boxShadow: color !== OFF ? `0 0 ${LAMP / 2}px ${color}` : 'none'
      }}
    />
  )
})

export function DevicePreview({
  device,
  frame
}: {
  device: HardwareDeviceConfiguration
  frame: readonly RgbColor[]
}): React.JSX.Element {
  const shape = shapeOf(device)
  const at = (lamp: number): RgbColor => frame[lamp] ?? OFF
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
            return <Lamp key={`${x}-${y}`} color={at(lamp)} title={`lamp ${lamp}`} />
          })
        )}
      </div>
    )
  }
  return (
    <div
      className="flex flex-wrap rounded border border-white/10 bg-black/50 p-1"
      style={{ gap: GAP, maxWidth: (LAMP + GAP) * 32 }}
    >
      {Array.from({ length: device.count ?? 1 }, (_, lamp) => (
        <Lamp key={lamp} color={at(lamp)} title={`lamp ${lamp}`} />
      ))}
    </div>
  )
}
