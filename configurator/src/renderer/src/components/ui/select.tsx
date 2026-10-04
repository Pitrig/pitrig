import { Check, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/lib/utils'
import { usePopoverAnchor } from './popover-anchor'

export interface SelectOption<T extends string | number> {
  value: T
  label: string
  disabled?: boolean
}

const OPTION_HEIGHT_PX = 24
const LIST_PADDING_PX = 10
const LIST_MAX_HEIGHT_PX = 320
const TYPEAHEAD_RESET_MS = 600

const TRIGGER =
  'inline-flex h-8 min-w-0 items-center justify-between gap-1.5 rounded-md border bg-background px-2 text-left text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-50'

function enabledIndex<T extends string | number>(
  options: readonly SelectOption<T>[],
  from: number,
  step: 1 | -1
): number {
  for (let index = from; index >= 0 && index < options.length; index += step) {
    if (!options[index]?.disabled) return index
  }
  return -1
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  id,
  className,
  disabled,
  title,
  placeholder,
  'aria-label': ariaLabel
}: {
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  id?: string
  className?: string
  disabled?: boolean
  title?: string
  placeholder?: string
  'aria-label'?: string
}): React.JSX.Element {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [width, setWidth] = useState(0)
  const [triggerWidth, setTriggerWidth] = useState(0)
  const typed = useRef({ text: '', at: 0 })
  const dismiss = useCallback(() => setOpen(false), [])
  const height = Math.min(options.length * OPTION_HEIGHT_PX + LIST_PADDING_PX, LIST_MAX_HEIGHT_PX)
  const { trigger, popover, anchor } = usePopoverAnchor(open, width, dismiss, height)
  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = options[selectedIndex]

  useLayoutEffect(() => {
    if (!open || !popover.current) return
    setWidth(popover.current.offsetWidth)
  }, [open, anchor, popover])

  useEffect(() => {
    if (!open) return
    popover.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, highlight, popover])

  useEffect(() => {
    if (!open) return undefined
    window.addEventListener('blur', dismiss)
    return () => window.removeEventListener('blur', dismiss)
  }, [open, dismiss])

  const show = (): void => {
    if (disabled || options.length === 0) return
    const measured = trigger.current?.offsetWidth ?? 0
    setTriggerWidth(measured)
    setWidth(measured)
    setHighlight(selectedIndex >= 0 ? selectedIndex : enabledIndex(options, 0, 1))
    setOpen(true)
  }

  const commit = (index: number): void => {
    const option = options[index]
    if (!option || option.disabled) return
    setOpen(false)
    if (option.value !== value) onChange(option.value)
  }

  const typeAhead = (character: string): void => {
    const now = Date.now()
    const text = (now - typed.current.at > TYPEAHEAD_RESET_MS ? '' : typed.current.text) + character
    typed.current = { text: text.toLowerCase(), at: now }
    const start = text.length === 1 ? highlight + 1 : Math.max(highlight, 0)
    const ordered = [...options.slice(start), ...options.slice(0, start)]
    const match = ordered.find(
      (option) => !option.disabled && option.label.toLowerCase().startsWith(typed.current.text)
    )
    if (match) setHighlight(options.indexOf(match))
  }

  const step = (from: number, direction: 1 | -1): void => {
    const next = enabledIndex(options, from, direction)
    if (next >= 0) setHighlight(next)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key) || printable) {
        event.preventDefault()
        event.stopPropagation()
        show()
      }
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    const typing = Date.now() - typed.current.at < TYPEAHEAD_RESET_MS
    if (event.key === ' ' && typing) typeAhead(' ')
    else if (event.key === 'ArrowDown') step(highlight + 1, 1)
    else if (event.key === 'ArrowUp') step(highlight - 1, -1)
    else if (event.key === 'Home') step(0, 1)
    else if (event.key === 'End') step(options.length - 1, -1)
    else if (event.key === 'Enter' || event.key === ' ') commit(highlight)
    else if (printable) typeAhead(event.key)
    else return
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && highlight >= 0 ? `${listId}-${highlight}` : undefined}
        title={title}
        disabled={disabled}
        className={cn(TRIGGER, className)}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        <span className="min-w-0 truncate">{selected?.label ?? placeholder ?? ''}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 flex-none text-muted-foreground" />
      </button>
      {open && anchor
        ? createPortal(
            <div
              ref={popover}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              className="fixed z-50 overflow-y-auto rounded-md border bg-popover p-1 text-xs text-popover-foreground shadow-md"
              style={{
                left: anchor.left,
                top: anchor.top,
                bottom: anchor.bottom,
                minWidth: triggerWidth,
                maxHeight: Math.min(anchor.maxHeight, LIST_MAX_HEIGHT_PX)
              }}
              onPointerDown={(event) => event.preventDefault()}
            >
              {options.map((option, index) => (
                <div
                  key={String(option.value)}
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === selectedIndex}
                  aria-disabled={option.disabled || undefined}
                  className={cn(
                    'flex h-6 cursor-default items-center gap-2 whitespace-nowrap rounded px-2',
                    index === highlight && 'bg-muted',
                    option.disabled && 'opacity-40'
                  )}
                  onPointerMove={() => {
                    if (!option.disabled && index !== highlight) setHighlight(index)
                  }}
                  onClick={() => commit(index)}
                >
                  <Check
                    aria-hidden="true"
                    className={cn('size-3 flex-none', index !== selectedIndex && 'invisible')}
                  />
                  {option.label}
                </div>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
