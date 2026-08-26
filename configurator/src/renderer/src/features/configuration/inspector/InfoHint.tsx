import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

const MARGIN = 6
const WIDTH_PX = 288

export function InfoHint({ text, label }: { text: string; label?: string }): React.JSX.Element {
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; top?: number; bottom?: number }>()

  useEffect(() => {
    if (!open) return undefined
    const place = (): void => {
      const rect = button.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(WIDTH_PX, window.innerWidth - MARGIN * 2)
      const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN))
      const below = window.innerHeight - rect.bottom - MARGIN * 2
      const upward = below < 120 && rect.top > below
      setAnchor({
        left,
        top: upward ? undefined : rect.bottom + MARGIN,
        bottom: upward ? window.innerHeight - rect.top + MARGIN : undefined
      })
    }
    place()
    const dismiss = (event: PointerEvent): void => {
      if (!button.current?.contains(event.target as Node | null)) setOpen(false)
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    window.addEventListener('pointerdown', dismiss, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('pointerdown', dismiss, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-label={label ? `About ${label}` : 'About this property'}
        className={`shrink-0 rounded-sm ${open ? 'text-foreground' : 'text-muted-foreground/60 hover:text-foreground'}`}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen((shown) => !shown)
        }}
      >
        <Info aria-hidden className="size-3" />
      </button>
      {open && anchor
        ? createPortal(
            <div
              role="tooltip"
              className="fixed z-50 rounded-md border bg-background p-2 text-xs leading-4 text-muted-foreground shadow-lg"
              style={{
                left: anchor.left,
                top: anchor.top,
                bottom: anchor.bottom,
                width: Math.min(WIDTH_PX, window.innerWidth - MARGIN * 2)
              }}
            >
              {text}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
