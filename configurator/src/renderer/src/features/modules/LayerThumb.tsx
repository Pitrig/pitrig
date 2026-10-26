import type { HardwareDeviceConfiguration } from '@shared/configuration-schema'
import { drawnSize, lampsOf, matrixLamp, shapeOf } from '@shared/led-render'

const STRIP_WIDTH = 72
const STRIP_HEIGHT = 8
const PIXEL = 3

function runsOf(lamps: ReadonlySet<number>): [number, number][] {
  const sorted = [...lamps].sort((first, second) => first - second)
  const runs: [number, number][] = []
  for (const lamp of sorted) {
    const last = runs.at(-1)
    if (last && last[1] === lamp - 1) last[1] = lamp
    else runs.push([lamp, lamp])
  }
  return runs
}

export function LayerThumb({
  device,
  lamps,
  color
}: {
  device: HardwareDeviceConfiguration
  lamps: ReadonlySet<number>
  color: string
}): React.JSX.Element {
  const shape = shapeOf(device)
  if (shape) {
    const drawn = drawnSize(shape)
    const cells: React.JSX.Element[] = []
    for (let y = 0; y < drawn.height; ++y) {
      for (let x = 0; x < drawn.width; ++x) {
        const lamp = matrixLamp(shape, x, y)
        cells.push(
          <rect
            key={`${x}-${y}`}
            x={x * PIXEL}
            y={y * PIXEL}
            width={PIXEL - 0.5}
            height={PIXEL - 0.5}
            fill={lamps.has(lamp) ? color : 'rgba(255,255,255,0.08)'}
          />
        )
      }
    }
    return (
      <svg aria-hidden width={drawn.width * PIXEL} height={drawn.height * PIXEL} className="flex-none">
        {cells}
      </svg>
    )
  }
  const total = Math.max(1, lampsOf(device))
  const step = STRIP_WIDTH / total
  return (
    <svg aria-hidden width={STRIP_WIDTH} height={STRIP_HEIGHT} className="flex-none">
      <rect width={STRIP_WIDTH} height={STRIP_HEIGHT} rx={2} fill="rgba(255,255,255,0.08)" />
      {runsOf(lamps).map(([first, last]) => (
        <rect
          key={first}
          x={first * step}
          width={Math.max(1, (last - first + 1) * step)}
          height={STRIP_HEIGHT}
          rx={1}
          fill={color}
        />
      ))}
    </svg>
  )
}
