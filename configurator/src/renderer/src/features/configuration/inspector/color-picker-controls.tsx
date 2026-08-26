import { clamp, type Hsv } from './color-math'

const SQUARE_HEIGHT_PX = 132

export function SaturationSquare({
  hue,
  hsv,
  onChange
}: {
  hue: number
  hsv: Hsv
  onChange: (saturation: number, brightness: number) => void
}): React.JSX.Element {
  return (
    <div
      role="presentation"
      className="relative w-full cursor-crosshair"
      style={{
        height: SQUARE_HEIGHT_PX,
        backgroundImage: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))`
      }}
      onPointerDown={track((x, y) => onChange(x, 1 - y))}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
      />
    </div>
  )
}

export function HueSlider({ hue, onChange }: { hue: number; onChange: (hue: number) => void }): React.JSX.Element {
  return (
    <div
      role="slider"
      aria-label="Hue"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={Math.round(hue)}
      tabIndex={0}
      className="relative h-3 min-w-0 flex-1 cursor-pointer rounded-full"
      style={{
        backgroundImage:
          'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'
      }}
      onPointerDown={track((x) => onChange(x * 359))}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') onChange(Math.max(0, hue - 2))
        else if (event.key === 'ArrowRight') onChange(Math.min(359, hue + 2))
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
        style={{ left: `${(hue / 359) * 100}%`, backgroundColor: `hsl(${hue} 100% 50%)` }}
      />
    </div>
  )
}

function track(
  report: (x: number, y: number) => void
): (event: React.PointerEvent<HTMLElement>) => void {
  return (event) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const at = (clientX: number, clientY: number): void =>
      report(
        clamp((clientX - rect.left) / rect.width, 0, 1),
        clamp((clientY - rect.top) / rect.height, 0, 1)
      )
    at(event.clientX, event.clientY)
    const move = (moved: PointerEvent): void => at(moved.clientX, moved.clientY)
    const release = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', release)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', release)
  }
}
