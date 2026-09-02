import { useEffect, useRef } from 'react'

import type { LedSpriteConfiguration } from '@shared/configuration-schema'
import {
  frameOf,
  inkAt,
  inkColor,
  spriteGeometry,
  TRANSPARENT_INK
} from '@shared/led-sprite'
import { beginStroke, endStroke, paintPixel } from './sprite-document'

const CELL = 22
const GAP = 2

function cellStyle(color: string | undefined): React.CSSProperties {
  if (color === undefined) {
    return {
      width: CELL,
      height: CELL,
      backgroundColor: 'transparent',
      backgroundImage:
        'linear-gradient(45deg,#ffffff1a 25%,transparent 25%,transparent 75%,#ffffff1a 75%),linear-gradient(45deg,#ffffff1a 25%,transparent 25%,transparent 75%,#ffffff1a 75%)',
      backgroundSize: `${CELL / 2}px ${CELL / 2}px`,
      backgroundPosition: `0 0, ${CELL / 4}px ${CELL / 4}px`
    }
  }
  return {
    width: CELL,
    height: CELL,
    background: color,
    boxShadow: color === '#000000' ? 'none' : `0 0 ${CELL / 3}px ${color}80`
  }
}

export function SpriteCanvas({
  output,
  at,
  sprite,
  frame,
  ink,
  onion
}: {
  output: number
  at: number
  sprite: LedSpriteConfiguration
  frame: number
  ink: number
  onion: boolean
}): React.JSX.Element {
  const painting = useRef(false)

  useEffect(() => {
    const stop = (): void => {
      if (!painting.current) return
      painting.current = false
      endStroke()
    }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      stop()
    }
  }, [])

  const { width, height } = spriteGeometry(sprite)
  const digits = frameOf(sprite, frame)
  const behind = onion && frame > 0 ? frameOf(sprite, frame - 1) : ''

  const put = (pixel: number): void => {
    if (inkAt(digits, pixel) === ink) return
    paintPixel(output, at, frame, pixel, ink)
  }

  return (
    <div
      className="w-fit max-w-full overflow-auto rounded border border-white/10 bg-black/50 p-1"
      onPointerLeave={() => {
        if (!painting.current) return
        painting.current = false
        endStroke()
      }}
    >
      <div
        className="grid"
        style={{ gap: GAP, gridTemplateColumns: `repeat(${width}, ${CELL}px)` }}
      >
        {Array.from({ length: height }, (_, y) =>
          Array.from({ length: width }, (_, x) => {
            const pixel = y * width + x
            const value = inkAt(digits, pixel)
            const color = inkColor(sprite, value)
            const ghost = behind === '' ? undefined : inkColor(sprite, inkAt(behind, pixel))
            return (
              <button
                key={pixel}
                type="button"
                aria-label={`Pixel ${x + 1}, ${y + 1}`}
                title={
                  value === TRANSPARENT_INK || color === undefined
                    ? `${x + 1}, ${y + 1} — clear`
                    : `${x + 1}, ${y + 1} — ${color}`
                }
                className="relative rounded-sm ring-1 ring-inset ring-white/10 hover:ring-sky-400"
                style={cellStyle(color)}
                onPointerDown={() => {
                  if (painting.current) endStroke()
                  beginStroke()
                  painting.current = true
                  put(pixel)
                }}
                onPointerEnter={() => {
                  if (painting.current) put(pixel)
                }}
              >
                {color === undefined && ghost !== undefined ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-1 rounded-[1px] opacity-30"
                    style={{ background: ghost }}
                  />
                ) : null}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
