import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import type { ScreenConfiguration } from '@shared/configuration-schema'

import { flattenScreen } from '@/features/configuration/preview/preview-layers'
import { SCREEN_BACKGROUND } from '@/features/configuration/preview/preview-theme'
import { WidgetLayers } from '@/features/configuration/preview/WidgetLayers'

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
  const background = screen?.background_color ?? SCREEN_BACKGROUND
  const layers = useMemo(
    () => flattenScreen(screen, {}, screen?.background_color ?? SCREEN_BACKGROUND),
    [screen]
  )

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
      <WidgetLayers layers={layers} />
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
