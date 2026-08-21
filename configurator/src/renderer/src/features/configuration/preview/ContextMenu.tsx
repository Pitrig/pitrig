import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { DisplayDescriptor } from '@shared/device'
import { type MenuEntry, screenMenuEntries, widgetMenuEntries } from './menu-entries'

// The popup itself. Hand-built rather than pulled in: the application has no
// menu primitive and no component library behind it, and what this needs — a
// list, one level of submenu, and closing when the pointer goes anywhere else —
// is smaller than the dependency would be. What goes in it lives next door in
// menu-entries.
//
// It is `fixed` rather than absolute so it is positioned in the same
// coordinates the pointer event reports, and so the canvas card, which clips
// its own overflow, cannot cut it off.

export function ContextMenu({
  x,
  y,
  entries,
  onClose
}: {
  x: number
  y: number
  entries: readonly MenuEntry[]
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x, y })
  const [openSubmenu, setOpenSubmenu] = useState<number>()

  // Measured after mounting rather than guessed: a menu opened near the bottom
  // right of the window has to come back inside it, and how far depends on how
  // many entries it ended up with.
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setPosition({
      x: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - box.height - 4))
    })
  }, [x, y])

  useEffect(() => {
    const away = (event: PointerEvent): void => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    // Capture, so a press that would otherwise start a gesture on the canvas
    // closes the menu instead of doing both.
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-52 rounded-md border bg-popover p-1 text-xs text-popover-foreground shadow-xl"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {entries.map((entry, index) => (
        <Entry
          key={index}
          entry={entry}
          open={openSubmenu === index}
          onOpen={() => setOpenSubmenu(entry.kind === 'submenu' ? index : undefined)}
          onClose={onClose}
        />
      ))}
    </div>
  )
}

function Entry({
  entry,
  open,
  onOpen,
  onClose
}: {
  entry: MenuEntry
  open: boolean
  onOpen: () => void
  onClose: () => void
}): React.JSX.Element {
  if (entry.kind === 'separator') return <div className="my-1 h-px bg-border" />
  if (entry.kind === 'submenu') {
    return (
      <div className="relative" onPointerEnter={onOpen}>
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center justify-between gap-4 rounded px-2 py-1.5 text-left hover:bg-muted"
        >
          <EntryLabel>{entry.label}</EntryLabel>
          <span className="text-muted-foreground">▸</span>
        </button>
        {open ? (
          <div className="absolute left-full top-0 ml-1 min-w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-xl">
            {entry.items.map((item, index) => (
              <Entry key={index} entry={item} open={false} onOpen={() => {}} onClose={onClose} />
            ))}
          </div>
        ) : null}
      </div>
    )
  }
  const checked = entry.kind === 'toggle' ? entry.checked : undefined
  return (
    <button
      type="button"
      role="menuitem"
      disabled={entry.kind === 'item' && entry.disabled}
      className="flex w-full items-center justify-between gap-4 rounded px-2 py-1.5 text-left hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
      onPointerEnter={onOpen}
      onClick={() => {
        entry.run()
        onClose()
      }}
    >
      <EntryLabel checked={checked}>{entry.label}</EntryLabel>
      {entry.kind === 'item' && entry.hint ? (
        <span className="text-muted-foreground">{entry.hint}</span>
      ) : null}
    </button>
  )
}

/**
 * A name, behind the column the tick lives in.
 *
 * Every entry reserves that column, including the ones that can never be
 * ticked: without it a submenu's name started at the left edge while an item's
 * started twenty pixels in, and a menu holding both read as two menus that had
 * been stacked by accident.
 */
function EntryLabel({
  checked,
  children
}: {
  checked?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className="w-3 flex-none text-sky-400">
        {checked ? '✓' : ''}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

/** The menu over the canvas: on a widget, or on the screen behind it. */
export function CanvasContextMenu({
  x,
  y,
  widgetId,
  display,
  at,
  onClose
}: {
  x: number
  y: number
  widgetId?: string
  display: DisplayDescriptor
  /** Where the click landed on the display, which is where a new widget goes. */
  at?: { x: number; y: number }
  onClose: () => void
}): React.JSX.Element {
  const entries = widgetId
    ? widgetMenuEntries(widgetId, display)
    : screenMenuEntries(display, at)
  return <ContextMenu x={x} y={y} entries={entries} onClose={onClose} />
}

