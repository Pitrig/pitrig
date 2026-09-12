import { useEffect, useRef, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function focusablesOf(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return []
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
}

export function ModalDialog({
  label,
  className,
  dismissible = true,
  onClose,
  children
}: {
  label: string
  className?: string
  dismissible?: boolean
  onClose: () => void
  children: ReactNode
}): React.JSX.Element {
  const panel = useRef<HTMLDivElement>(null)
  const behaviour = useRef({ dismissible, onClose })

  useEffect(() => {
    behaviour.current = { dismissible, onClose }
  })

  useEffect(() => {
    const restore = document.activeElement
    focusablesOf(panel.current)[0]?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (!behaviour.current.dismissible) return
        event.preventDefault()
        event.stopPropagation()
        behaviour.current.onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusablesOf(panel.current)
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      const active = document.activeElement
      const outside = !panel.current?.contains(active)
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      if (restore instanceof HTMLElement) restore.focus()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (behaviour.current.dismissible) behaviour.current.onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn('rounded-lg border bg-background text-xs shadow-lg', className)}
      >
        {children}
      </div>
    </div>
  )
}
