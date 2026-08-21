import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import type { ScreenConfiguration } from '@shared/configuration-schema'

import { flattenScreen } from '@/features/configuration/preview/preview-layers'
import { SCREEN_BACKGROUND } from '@/features/configuration/preview/preview-theme'
import { WidgetLayers } from '@/features/configuration/preview/WidgetLayers'

/**
 * A dashboard's screens, one at a time.
 *
 * A dashboard holds up to four screens and a card has room for one, so they are
 * a gallery: dragged sideways, stepped with the arrows, counted by the dots. It
 * is the same renderers the canvas uses, so a dashboard looks here as it will
 * look once it is on a board.
 *
 * Three places show one — a library card, the save dialog, the screen picker —
 * which is why it is a component of its own rather than markup inside the card.
 */

/** How far a drag has to travel before it counts as a swipe rather than a click. */
const SWIPE_THRESHOLD_PX = 32

export function ScreenGallery({
  screens,
  display,
  className
}: {
  screens: readonly ScreenConfiguration[]
  display: { width: number; height: number }
  className?: string
}): React.JSX.Element {
  const [index, setIndex] = useState(0)
  const swipe = useRef<{ pointerId: number; startX: number } | undefined>(undefined)

  // A sparse document can hold no screen array at all and still be one screen:
  // the board composes it, and the canvas draws it.
  const count = Math.max(screens.length, 1)
  const shown = Math.min(index, count - 1)
  const step = (delta: number): void => setIndex((current) => (current + delta + count) % count)

  return (
    <div className={`relative size-full ${className ?? ''}`}>
      <ScreenView
        screen={screens[shown]}
        display={display}
        onPointerDown={(event) => {
          if (count < 2) return
          swipe.current = { pointerId: event.pointerId, startX: event.clientX }
        }}
        onPointerUp={(event) => {
          const started = swipe.current
          swipe.current = undefined
          if (!started || started.pointerId !== event.pointerId) return
          const travelled = event.clientX - started.startX
          if (Math.abs(travelled) >= SWIPE_THRESHOLD_PX) step(travelled < 0 ? 1 : -1)
        }}
        // A drag that ends off the card never gets its release here, and a start
        // left behind would pair with the next one to arrive.
        onPointerLeave={() => {
          swipe.current = undefined
        }}
      />
      {count > 1 ? (
        <>
          <GalleryStep side="left" onClick={() => step(-1)} />
          <GalleryStep side="right" onClick={() => step(1)} />
          <div className="absolute inset-x-0 bottom-1 flex items-center justify-center gap-1">
            {Array.from({ length: count }, (_, dot) => (
              <button
                key={dot}
                type="button"
                aria-label={`Screen ${dot + 1}`}
                className={`size-1.5 rounded-full transition-colors ${
                  dot === shown ? 'bg-sky-400' : 'bg-white/30 hover:bg-white/60'
                }`}
                onClick={() => setIndex(dot)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

/**
 * One screen, fitted into whatever box it is given. The viewBox is the board's
 * own display, so nothing here scales anything — the browser fits it, and
 * `xMidYMid meet` keeps the board's proportions whatever shape the box is.
 */
export function ScreenView({
  screen,
  display,
  onPointerDown,
  onPointerUp,
  onPointerLeave
}: {
  screen: ScreenConfiguration | undefined
  display: { width: number; height: number }
  onPointerDown?: (event: React.PointerEvent) => void
  onPointerUp?: (event: React.PointerEvent) => void
  onPointerLeave?: () => void
}): React.JSX.Element {
  // Slots show their first page — the one the board shows before a tap or a
  // trigger raises another, which is the honest still of a moving thing.
  const layers = useMemo(() => flattenScreen(screen, {}), [screen])
  const background = screen?.background_color ?? SCREEN_BACKGROUND

  return (
    <svg
      aria-hidden="true"
      className="size-full touch-none select-none"
      viewBox={`0 0 ${display.width} ${display.height}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
    >
      <rect width={display.width} height={display.height} fill={background} />
      <WidgetLayers layers={layers} background={background} />
    </svg>
  )
}

function GalleryStep({
  side,
  onClick
}: {
  side: 'left' | 'right'
  onClick: () => void
}): React.JSX.Element {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      aria-label={side === 'left' ? 'Previous screen' : 'Next screen'}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-0.5 text-white/70 opacity-0 transition-opacity hover:text-white group-hover:opacity-100 ${
        side === 'left' ? 'left-1' : 'right-1'
      }`}
      onClick={onClick}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  )
}
