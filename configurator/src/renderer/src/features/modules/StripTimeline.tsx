import { useEffect, useRef } from 'react'

import type { LedSpriteConfiguration } from '@shared/configuration-schema'
import { frameOf, inkAt, inkColor, spriteGeometry } from '@shared/led-sprite'
import { t } from '@shared/ui-text'
import { beginStroke, endStroke, paintPixel } from './sprite-document'

const CLEAR =
  'linear-gradient(45deg,#ffffff1a 25%,transparent 25%,transparent 75%,#ffffff1a 75%),linear-gradient(45deg,#ffffff1a 25%,transparent 25%,transparent 75%,#ffffff1a 75%)'

function cellSize(lamps: number): number {
  return lamps <= 32 ? 18 : lamps <= 64 ? 12 : 8
}

export function StripTimeline({
  output,
  at,
  sprite,
  frame,
  ink,
  onSelect
}: {
  output: number
  at: number
  sprite: LedSpriteConfiguration
  frame: number
  ink: number
  onSelect: (frame: number) => void
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

  const { width, frames } = spriteGeometry(sprite)
  const cell = cellSize(width)
  const put = (row: number, lamp: number): void => {
    if (inkAt(frameOf(sprite, row), lamp) === ink) return
    paintPixel(output, at, row, lamp, ink)
  }

  return (
    <div className="max-w-full overflow-auto rounded border border-white/10 bg-black/50 p-1">
      <div className="grid w-fit gap-[2px]" style={{ gridTemplateColumns: `2.5rem repeat(${width}, ${cell}px)` }}>
        {Array.from({ length: frames }, (_, row) => {
          const digits = frameOf(sprite, row)
          return [
            <button
              key={`frame-${row}`}
              type="button"
              className={`rounded px-1 text-left text-[10px] ${row === frame ? 'bg-sky-500/25 text-sky-200' : 'text-muted-foreground hover:bg-white/5'}`}
              onClick={() => onSelect(row)}
            >
              {row + 1}
            </button>,
            ...Array.from({ length: width }, (_, lamp) => {
              const color = inkColor(sprite, inkAt(digits, lamp))
              return (
                <button
                  key={`${row}-${lamp}`}
                  type="button"
                  aria-label={t('modules.stripTimeline.frameLamp', { frame: row + 1, lamp: lamp + 1 })}
                  className="rounded-sm ring-1 ring-inset ring-white/10 hover:ring-sky-400"
                  style={{
                    width: cell,
                    height: cell,
                    background: color ?? 'transparent',
                    backgroundImage: color === undefined ? CLEAR : undefined,
                    backgroundSize: color === undefined ? `${cell / 2}px ${cell / 2}px` : undefined
                  }}
                  onPointerDown={() => {
                    if (painting.current) endStroke()
                    beginStroke()
                    painting.current = true
                    onSelect(row)
                    put(row, lamp)
                  }}
                  onPointerEnter={() => {
                    if (painting.current) put(row, lamp)
                  }}
                />
              )
            })
          ]
        })}
      </div>
    </div>
  )
}
