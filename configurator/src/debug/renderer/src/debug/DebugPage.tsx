import { Eraser, Copy, Send } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { PageShell } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { controlCommandRefusal } from '@shared/control-command'
import {
  clearEventLog,
  getEventLogSnapshot,
  subscribeToEventLog,
  writeEventLog,
  type EventLogEntry
} from '@/lib/event-log'

const SUGGESTIONS = [
  '@PR:INFO',
  '@PR:GET:dashboard',
  '@PR:GET:protocol',
  '@PR:FONT:INFO',
  '@PR:IMAGE:INFO',
  '@PR:FW:INFO'
]

export function DebugPage(): React.JSX.Element {
  const { entries, omittedEntryCount } = useSyncExternalStore(
    subscribeToEventLog,
    getEventLogSnapshot,
    getEventLogSnapshot
  )
  const connected = useDeviceStore((state) => state.status === 'connected')
  const outputRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [command, setCommand] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!autoScroll) return
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight })
  }, [entries, autoScroll])

  const refusal = command.trim().length > 0 ? controlCommandRefusal(command) : undefined

  const send = async (): Promise<void> => {
    const line = command.trim()
    if (line.length === 0 || refusal) return
    setSending(true)
    try {
      const result = await window.pitrig.sendControlCommand({ command: line })
      writeEventLog(
        `Console ${line}`,
        result.ok
          ? result.value.lines.length > 0
            ? result.value.lines.join('\n')
            : 'The board answered nothing before the timeout.'
          : result.error.message
      )
      if (result.ok) setCommand('')
    } finally {
      setSending(false)
    }
  }

  const copyAll = (): void => {
    void navigator.clipboard.writeText(entries.map(formatEntry).join('\n'))
  }

  return (
    <PageShell
      title="Debug"
      description="Every line over the serial link, and a console for one command at a time."
      actions={
        <>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              checked={autoScroll}
              className="size-3.5"
              type="checkbox"
              onChange={(event) => setAutoScroll(event.target.checked)}
            />
            Autoscroll
          </label>
          <Button variant="outline" disabled={entries.length === 0} onClick={copyAll}>
            <Copy aria-hidden="true" className="mr-1.5 size-3.5" />
            Copy
          </Button>
          <Button variant="outline" disabled={entries.length === 0} onClick={clearEventLog}>
            <Eraser aria-hidden="true" className="mr-1.5 size-3.5" />
            Clear
          </Button>
        </>
      }
      fill
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          ref={outputRef}
          className="min-h-0 flex-1 overflow-auto bg-black/30 px-4 py-3 font-mono text-[11px] leading-4"
          role="log"
        >
          {omittedEntryCount > 0 ? (
            <div className="pb-1 text-amber-400">
              {omittedEntryCount} older entries dropped to keep the log bounded.
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
            <span className="text-zinc-600">
              Nothing yet. Connecting to a board is usually the first thing here.
            </span>
          )}
        </div>

        <div className="flex-none space-y-2 border-t p-3">
          <div className="flex items-center gap-2">
            <input
              aria-label="Control command"
              className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-zinc-500 disabled:opacity-50"
              disabled={!connected || sending}
              placeholder={connected ? '@PR:INFO' : 'Connect a board to send a command'}
              spellCheck={false}
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void send()
                }
              }}
            />
            <Button
              className="flex-none"
              disabled={!connected || sending || command.trim().length === 0 || Boolean(refusal)}
              onClick={() => void send()}
            >
              <Send aria-hidden="true" className="mr-1.5 size-3.5" />
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="rounded-md border px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setCommand(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
          {refusal ? (
            <p className="text-[11px] text-amber-400">{refusal}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              The reply is appended to the log above. Upload commands are refused here — they open
              a binary session this console cannot speak.
            </p>
          )}
        </div>
      </div>
    </PageShell>
  )
}

function formatEntry(entry: EventLogEntry): string {
  const data = entry.data === undefined ? '' : `\n${formatData(entry.data)}`
  return `${formatTimestamp(entry.timestamp)}  ${entry.message}${data}`
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
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}
