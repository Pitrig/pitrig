import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

/**
 * The explanation a property used to carry as a paragraph underneath it.
 *
 * Prose between the fields is read once and then scrolled past forever, so it
 * costs every later visit the height it took. This keeps the same words one
 * click away instead: the icon is always present, so the help is findable, and
 * the panel stays a list of properties.
 *
 * It opens on click rather than on hover — the text is long enough to be worth
 * reading rather than glancing at, and a popup that vanishes when the pointer
 * leaves cannot be read down to its last line.
 */

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
      // The panel is against the right edge of the window, so a popup pinned to
      // the icon's left runs off it. Pulling it back is what keeps the text on
      // screen; flipping it above the icon is the same answer vertically.
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
    // Captured on the window so it runs before the editor's own shortcuts:
    // Escape with the popup open means "close the popup", not "leave the
    // widget being explained".
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }
    // Positioned in viewport coordinates, so it has to follow the icon when the
    // inspector scrolls under it.
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
          // Inside a label cell, so the click would otherwise reach the control
          // this explains.
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
