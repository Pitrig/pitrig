import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import {
  clearDevelopmentLog,
  getDevelopmentLogSnapshot,
  subscribeToDevelopmentLog,
  writeDevelopmentLog
} from './development-log'

const MIN_LOG_HEIGHT = 80
const MIN_VISIBLE_APP_HEIGHT = 32
const KEYBOARD_RESIZE_STEP = 16

export function DevelopmentLog(): React.JSX.Element {
  const { entries, omittedEntryCount } = useSyncExternalStore(
    subscribeToDevelopmentLog,
    getDevelopmentLogSnapshot,
    getDevelopmentLogSnapshot
  )
  const outputRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(192)
  const [open, setOpen] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartRef = useRef({ pointerY: 0, height })

  useEffect(() => {
    if (!isResizing) {
      return
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (event: PointerEvent): void => {
      const delta = resizeStartRef.current.pointerY - event.clientY
      setHeight(clampLogHeight(resizeStartRef.current.height + delta))
    }
    const stopResizing = (): void => setIsResizing(false)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResizing)
    window.addEventListener('pointercancel', stopResizing)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResizing)
      window.removeEventListener('pointercancel', stopResizing)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [isResizing])

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }
    return window.simcore.onDevelopmentSerialTraffic?.((log) => {
      writeDevelopmentLog(
        `Serial ${log.direction.toUpperCase()} · ${log.path} @ ${log.baudRate}${
          log.encoding === 'hex' ? ' · hex' : ''
        }`,
        log.data
      )
    })
  }, [])

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight })
  }, [entries, open])

  if (!open) {
    return (
      <Button
        aria-label="Open development log"
        className="fixed right-4 bottom-4 z-50 size-11 rounded-full border-zinc-600/60 bg-zinc-900/70 p-0 text-zinc-300 shadow-lg backdrop-blur-sm hover:bg-zinc-800/90 hover:text-sky-300"
        title="Open development log"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <BugIcon />
      </Button>
    )
  }

  return (
    <section
      className="fixed inset-x-0 bottom-0 z-50 flex min-h-0 flex-col border-t bg-zinc-950 font-mono text-xs shadow-[0_-12px_32px_rgb(0_0_0/0.45)]"
      style={{ height }}
    >
      <div
        aria-label="Resize development log"
        aria-orientation="horizontal"
        aria-valuemax={maximumLogHeight()}
        aria-valuemin={MIN_LOG_HEIGHT}
        aria-valuenow={height}
        className="group flex h-1.5 flex-none cursor-row-resize items-center justify-center outline-none focus-visible:bg-sky-500/20"
        role="separator"
        tabIndex={0}
        onKeyDown={(event) => {
          const nextHeight = keyboardResizeHeight(event.key, height)
          if (nextHeight !== undefined) {
            event.preventDefault()
            setHeight(nextHeight)
          }
        }}
        onPointerDown={(event) => {
          event.preventDefault()
          resizeStartRef.current = { pointerY: event.clientY, height }
          setIsResizing(true)
        }}
      >
        <span className="h-px w-12 bg-zinc-700 transition-colors group-hover:bg-sky-400" />
      </div>
      <div className="flex h-8 flex-none items-center justify-between border-b px-3">
        <span className="font-sans font-medium text-zinc-300">Development log</span>
        <div className="flex items-center gap-1.5">
          <Button className="h-6 px-2" variant="outline" onClick={clearDevelopmentLog}>
            Clear
          </Button>
          <Button
            aria-label="Close development log"
            className="size-6 p-0"
            title="Close development log"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            <CloseIcon />
          </Button>
        </div>
      </div>
      <div ref={outputRef} className="min-h-0 flex-1 overflow-auto px-3 py-2" role="log">
        {omittedEntryCount > 0 ? (
          <div className="pb-1 text-amber-400">
            {omittedEntryCount} older log entries omitted.
          </div>
        ) : null}
        {entries.length > 0 ? (
          entries.map((entry) => (
            <div key={entry.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 py-0.5">
              <time className="text-zinc-500">{formatTimestamp(entry.timestamp)}</time>
              <div className="min-w-0 text-zinc-300">
                <span className="text-sky-400">{entry.message}</span>
                {entry.data === undefined ? null : (
                  <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap break-words text-zinc-400">
                    {formatData(entry.data)}
                  </pre>
                )}
              </div>
            </div>
          ))
        ) : (
          <span className="text-zinc-600">No development events yet.</span>
        )}
      </div>
    </section>
  )
}

function BugIcon(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="m8 2 1.5 2M16 2l-1.5 2M9 9h6M9 13h6M12 4a5 5 0 0 1 5 5v5a5 5 0 0 1-10 0V9a5 5 0 0 1 5-5Z" />
      <path d="M3 9h4M17 9h4M3 14h4M17 14h4M5 20l3-3M19 20l-3-3" />
    </svg>
  )
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
      viewBox="0 0 16 16"
    >
      <path d="m3 3 10 10M13 3 3 13" />
    </svg>
  )
}

function clampLogHeight(height: number): number {
  return Math.min(Math.max(height, MIN_LOG_HEIGHT), maximumLogHeight())
}

function maximumLogHeight(): number {
  return Math.max(MIN_LOG_HEIGHT, window.innerHeight - MIN_VISIBLE_APP_HEIGHT)
}

function keyboardResizeHeight(key: string, currentHeight: number): number | undefined {
  if (key === 'ArrowUp') {
    return clampLogHeight(currentHeight + KEYBOARD_RESIZE_STEP)
  }
  if (key === 'ArrowDown') {
    return clampLogHeight(currentHeight - KEYBOARD_RESIZE_STEP)
  }
  if (key === 'Home') {
    return MIN_LOG_HEIGHT
  }
  if (key === 'End') {
    return maximumLogHeight()
  }
  return undefined
}

function formatTimestamp(timestamp: Date): string {
  return timestamp.toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  })
}

function formatData(data: unknown): string {
  if (typeof data === 'string') {
    return data
  }
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}
