import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { HINTS } from './hints'
import { PropertyRow } from './PropertyRow'

const MARGIN = 4
const MINIMUM_POPUP_PX = 160
const MAXIMUM_POPUP_PX = 256

export function TelemetryBindingField({ value, onChange, onReset, label = 'Binding', hint = HINTS.data.binding }: { value: string; onChange: (value: string) => void; onReset?: () => void; label?: string; hint?: string }): React.JSX.Element {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [anchor, setAnchor] = useState<{
    left: number
    top?: number
    bottom?: number
    width: number
    maxHeight: number
  }>()

  const selected = TELEMETRY_CATALOG.find(({ name }) => name === value)
  const needle = value.trim().toLowerCase()
  const matches =
    needle === '' || selected
      ? TELEMETRY_CATALOG
      : TELEMETRY_CATALOG.filter(
          (entry) =>
            entry.name.toLowerCase().includes(needle) ||
            entry.categoryLabel.toLowerCase().includes(needle)
        )

  useEffect(() => {
    if (!open) return undefined
    const place = (): void => {
      const rect = inputRef.current?.getBoundingClientRect()
      if (!rect) return
      const below = window.innerHeight - rect.bottom - MARGIN * 2
      const above = rect.top - MARGIN * 2
      const upward = below < MINIMUM_POPUP_PX && above > below
      setAnchor({
        left: Math.max(MARGIN, Math.min(rect.left, window.innerWidth - rect.width - MARGIN)),
        top: upward ? undefined : rect.bottom + MARGIN,
        bottom: upward ? window.innerHeight - rect.top + MARGIN : undefined,
        width: rect.width,
        maxHeight: Math.max(MINIMUM_POPUP_PX, Math.min(MAXIMUM_POPUP_PX, upward ? above : below))
      })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const commit = (name: string): void => {
    onChange(name)
    setOpen(false)
  }

  return (
    <PropertyRow label={label} controlId={inputId} hint={hint} modified={value !== ''} onReset={onReset} block>
      <div className="space-y-1 text-muted-foreground">
      <input
        id={inputId}
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls="telemetry-binding-list"
        className="h-7 w-full rounded-md border bg-background px-2 text-foreground"
        placeholder="Search telemetry fields"
        value={value}
        onFocus={() => {
          setActive(0)
          setOpen(true)
        }}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onChange(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
            return
          }
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            setOpen(true)
            return
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive((index) => Math.min(index + 1, matches.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((index) => Math.max(index - 1, 0))
          } else if (event.key === 'Enter' && open) {
            const entry = matches[active]
            if (entry) {
              event.preventDefault()
              commit(entry.name)
            }
          }
        }}
      />
      {open && anchor && matches.length > 0
        ? createPortal(
            <ul
              id="telemetry-binding-list"
              ref={listRef}
              role="listbox"
              className="fixed z-50 overflow-y-auto rounded-md border bg-background text-xs shadow-lg"
              style={{
                left: anchor.left,
                top: anchor.top,
                bottom: anchor.bottom,
                width: anchor.width,
                maxHeight: anchor.maxHeight
              }}
              onPointerDown={(event) => event.preventDefault()}
            >
              {matches.map((entry, index) => (
                <li key={entry.name}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={entry.name === value}
                    className={`block w-full px-2 py-1 text-left ${index === active ? 'bg-muted' : ''} hover:bg-muted`}
                    onPointerEnter={() => setActive(index)}
                    onClick={() => commit(entry.name)}
                  >
                    <span className="block truncate text-foreground">{entry.name}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {entry.categoryLabel} — {entry.description}
                    </span>
                  </button>
                </li>
              ))}
            </ul>,
            document.body
          )
        : null}
      {selected ? (
        <span className="block text-[11px] leading-4">
          {selected.categoryLabel} · {selected.type} · {selected.unit} · {selected.rate} · ID {selected.wireId}
        </span>
      ) : value ? (
        <span className="block text-[11px] leading-4 text-amber-400">Unknown telemetry binding</span>
      ) : null}
      </div>
    </PropertyRow>
  )
}

export { SourceEditor } from './SourceEditor'
