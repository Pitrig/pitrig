import { useEffect, useRef, useState } from 'react'
import { type FontSpec, type RgbColor, WIDGET_ID_CAPACITY } from '../../../../../shared/configuration-schema'

export function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element { return <section className="space-y-2 border-t pt-3"><h3 className="font-medium">{title}</h3>{children}</section> }
export function Hint({ children }: { children: React.ReactNode }): React.JSX.Element { return <p className="rounded-md border p-2 text-muted-foreground">{children}</p> }
export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): React.JSX.Element {
  const [local, change, flush] = useDebouncedCommit(value, onChange)
  return <label className="block space-y-1 text-muted-foreground"><span>{label}</span><input className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={local} onChange={(event) => change(event.target.value)} onBlur={flush} /></label>
}
export function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min?: number; max?: number; step?: number | 'any'; onChange: (value: number) => void }): React.JSX.Element {
  const [local, change, flush] = useDebouncedCommit(value, onChange)
  return <label className="block space-y-1 text-muted-foreground"><span>{label}</span><input type="number" className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={local} min={min} max={max} step={step} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) change(next) }} onBlur={flush} /></label>
}
export function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }): React.JSX.Element { return <label className="block space-y-1 text-muted-foreground"><span>{label}</span><select className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={value} onChange={(event) => onChange(event.target.value)}>{value === '' ? <option value="">Not set</option> : null}{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label> }
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: RgbColor) => void }): React.JSX.Element {
  const [local, change, flush] = useDebouncedCommit(value, (next) => onChange(next as RgbColor))
  const opaque = /^#[0-9A-Fa-f]{6}$/.test(local)
  return <label className="flex items-end gap-2 text-muted-foreground"><span className="min-w-0 flex-1 space-y-1"><span className="block">{label}</span><input className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={local} onChange={(event) => change(event.target.value)} onBlur={flush} /></span><input aria-label={`${label} picker`} type="color" className="h-8 w-10 rounded border bg-background p-1" value={opaque ? local : '#000000'} onChange={(event) => onChange(event.target.value as RgbColor)} /></label>
}
export function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }): React.JSX.Element { return <label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label> }

export function OptionalColorField({ label, value, onChange }: { label: string; value?: string; onChange: (value: RgbColor | undefined) => void }): React.JSX.Element {
  return (
    <div className="space-y-1">
      <CheckboxField label={`${label} enabled`} checked={value !== undefined} onChange={(checked) => onChange(checked ? '#000000' : undefined)} />
      {value !== undefined ? <ColorField label={label} value={value} onChange={onChange} /> : null}
    </div>
  )
}

/**
 * Keeps typing local and commits on a trailing delay or on blur. Without this
 * every keystroke rewrote the whole configuration document.
 */
function useDebouncedCommit<T>(value: T, commit: (value: T) => void, delay = 200): [T, (next: T) => void, () => void] {
  const [local, setLocal] = useState(value)
  const editing = useRef(false)
  const latest = useRef(commit)

  useEffect(() => {
    latest.current = commit
  })

  useEffect(() => {
    if (!editing.current) setLocal(value)
  }, [value])

  useEffect(() => {
    if (!editing.current) return
    const timer = setTimeout(() => {
      editing.current = false
      latest.current(local)
    }, delay)
    return () => clearTimeout(timer)
  }, [local, delay])

  const change = (next: T): void => {
    editing.current = true
    setLocal(next)
  }
  const flush = (): void => {
    if (!editing.current) return
    editing.current = false
    latest.current(local)
  }
  return [local, change, flush]
}

export function FontEditor({ font, onChange }: { font?: FontSpec; onChange: (font: FontSpec) => void }): React.JSX.Element { return <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2"><TextField label="Font family" value={font?.family ?? ''} onChange={(family) => onChange({ ...font, family })} /><NumberField label="Size" value={font?.size_px ?? 16} min={1} max={255} onChange={(size_px) => onChange({ ...font, size_px })} /></div> }
/**
 * An identifier the device stores and never draws. A rename that would collide
 * or overflow is refused rather than silently adjusted, and the field reverts so
 * the refusal is visible instead of the edit vanishing.
 */
export function IdField({
  label,
  value,
  onCommit
}: {
  label: string
  value: string
  onCommit: (name: string) => boolean
}): React.JSX.Element {
  // Keyed on the committed value by its callers, so a rename elsewhere remounts
  // this instead of being synced into it.
  const [draft, setDraft] = useState(value)
  const [rejected, setRejected] = useState(false)
  const commit = (): void => {
    if (draft === value) return
    if (!onCommit(draft)) {
      setRejected(true)
      setDraft(value)
    }
  }
  return (
    <label className="block space-y-1 text-muted-foreground">
      <span>{label}</span>
      <input
        value={draft}
        maxLength={WIDGET_ID_CAPACITY - 1}
        className={`h-8 w-full rounded-md border bg-background px-2 text-foreground ${rejected ? 'border-red-500' : ''}`}
        onChange={(event) => {
          setDraft(event.target.value)
          setRejected(false)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
      />
    </label>
  )
}
