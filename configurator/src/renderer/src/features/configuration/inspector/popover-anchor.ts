import { useEffect, useRef, useState } from 'react'

const MARGIN = 6

export interface PopoverAnchor {
  left: number
  top?: number
  bottom?: number
  maxHeight: number
}

export function usePopoverAnchor(open: boolean, width: number, dismiss: () => void): {
  trigger: React.RefObject<HTMLButtonElement | null>
  popover: React.RefObject<HTMLDivElement | null>
  anchor: PopoverAnchor | undefined
} {
  const trigger = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<PopoverAnchor>()

  useEffect(() => {
    if (!open) return undefined
    const place = (): void => {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) return
      const below = window.innerHeight - rect.bottom - MARGIN * 2
      const above = rect.top - MARGIN * 2
      const upward = above > below
      setAnchor({
        left: Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN)),
        top: upward ? undefined : rect.bottom + MARGIN,
        bottom: upward ? window.innerHeight - rect.top + MARGIN : undefined,
        maxHeight: Math.max(upward ? above : below, 0)
      })
    }
    const away = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (popover.current?.contains(target) || trigger.current?.contains(target)) return
      dismiss()
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      dismiss()
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [open, width, dismiss])

  return { trigger, popover, anchor }
}
