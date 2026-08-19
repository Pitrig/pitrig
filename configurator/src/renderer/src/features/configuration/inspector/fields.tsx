import { useEffect, useRef, useState } from 'react'
import { type FontSpec, type RgbColor, WIDGET_ID_CAPACITY } from '@shared/configuration-schema'
import { MAXIMUM_FONT_SIZE_PX } from '@shared/font-assets'
import { dashboardPalette } from '../dashboard-editor'
import { useDeviceStore } from '@/features/device/device-store'
import { FontPicker } from '@/features/font-library/FontPicker'
import { previewFontFamily, useFontFaceStore } from '@/features/font-library/font-face-store'
import { findFontEntry, useFontLibraryStore } from '@/features/font-library/font-library-store'

export function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element { return <section className="space-y-2 border-t pt-3"><h3 className="font-medium">{title}</h3>{children}</section> }
export function Hint({ children }: { children: React.ReactNode }): React.JSX.Element { return <p className="rounded-md border p-2 text-muted-foreground">{children}</p> }
export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): React.JSX.Element {
  const [local, change, flush] = useLiveCommit(value, onChange)
  return <label className="block space-y-1 text-muted-foreground"><span>{label}</span><input className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={local} onChange={(event) => change(event.target.value)} onBlur={flush} /></label>
}
export function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min?: number; max?: number; step?: number | 'any'; onChange: (value: number) => void }): React.JSX.Element {
  const [local, change, flush] = useLiveCommit(value, onChange)
  return <label className="block space-y-1 text-muted-foreground"><span>{label}</span><input type="number" className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={local} min={min} max={max} step={step} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) change(next) }} onBlur={flush} /></label>
}
// Generic over the option type, so a caller that passes the schema's own value
// list gets that type back in onChange instead of a bare string it has to cast.
// Thirteen `value as SomeEnum` casts existed only because this said string.
export function SelectField<T extends string>({ label, value, options, onChange }: { label: string; value: string; options: readonly T[]; onChange: (value: T) => void }): React.JSX.Element { return <label className="block space-y-1 text-muted-foreground"><span>{label}</span><select className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={value} onChange={(event) => onChange(event.target.value as T)}>{value === '' ? <option value="">Not set</option> : null}{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label> }
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: RgbColor) => void }): React.JSX.Element {
  const [local, change, flush] = useLiveCommit(value, (next) => onChange(next as RgbColor))
  const opaque = /^#[0-9A-Fa-f]{6}$/.test(local)
  // The browser draws the native picker's popup itself, so the colours already
  // on the dashboard cannot be put inside it. They go under the field instead,
  // where reaching one is a click rather than a trip through the picker.
  const palette = dashboardPalette(useDeviceStore((state) => state.draft))
  return (
    <div className="space-y-1">
      <label className="flex items-end gap-2 text-muted-foreground">
        <span className="min-w-0 flex-1 space-y-1"><span className="block">{label}</span><input className="h-8 w-full rounded-md border bg-background px-2 text-foreground" value={local} onChange={(event) => change(event.target.value)} onBlur={flush} /></span>
        <input aria-label={`${label} picker`} type="color" className="h-8 w-10 rounded border bg-background p-1" value={opaque ? local : '#000000'} onChange={(event) => change(event.target.value)} />
      </label>
      {palette.length > 0 ? (
        <div className="flex flex-wrap gap-1" role="group" aria-label={`${label} colors already on the dashboard`}>
          {palette.map((color) => (
            <button
              key={color}
              type="button"
              // The hex is the whole label: a swatch names itself by the colour
              // it shows, and a screen reader has nothing else to go on.
              title={color}
              aria-label={color}
              className="h-5 w-5 rounded border"
              style={{ backgroundColor: color }}
              onClick={() => change(color)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
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
 * How long after the last change the field stops owning the value and starts
 * following the document again. It exists so a value the document normalizes —
 * a negative padding clamped to zero — does not rewrite what is still being
 * typed; it no longer gates when the edit becomes visible.
 */
const SETTLE_MS = 200

/**
 * Keeps typing local while pushing every change into the document on the next
 * animation frame, so the canvas follows a held stepper button or a dragged
 * colour picker as it moves rather than once the interaction ends.
 *
 * Commits are coalesced to one per frame because each one rewrites the whole
 * document — the same bargain the canvas makes for a drag (see PreviewCanvas).
 * A connected device is rationed separately and much harder, on its own
 * trailing delay in use-live-apply, so this never costs a round trip per frame.
 *
 * The interaction is also one edit group, again like a drag: a held stepper
 * button commits every frame but is a single step for undo, rather than the
 * hundred entries that would otherwise bury what came before it.
 */
function useLiveCommit<T>(value: T, commit: (value: T) => void): [T, (next: T) => void, () => void] {
  const [local, setLocal] = useState(value)
  const editing = useRef(false)
  const grouped = useRef(false)
  const latest = useRef(commit)
  const frame = useRef<number | undefined>(undefined)

  useEffect(() => {
    latest.current = commit
  })

  useEffect(() => {
    if (!editing.current) setLocal(value)
  }, [value])

  const cancelFrame = (): void => {
    if (frame.current === undefined) return
    cancelAnimationFrame(frame.current)
    frame.current = undefined
  }
  // Balanced in every exit from an interaction — settling, blur and unmount —
  // because an unmatched beginEdit would group every later edit as well.
  const endGroup = (): void => {
    if (!grouped.current) return
    grouped.current = false
    useDeviceStore.getState().endEdit()
  }

  useEffect(() => {
    if (!editing.current) return
    // Superseded by the next change if one lands first, which is what collapses
    // a burst of steps into one commit per frame.
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined
      latest.current(local)
    })
    const settle = window.setTimeout(() => {
      editing.current = false
      endGroup()
    }, SETTLE_MS)
    return () => {
      cancelFrame()
      window.clearTimeout(settle)
    }
  }, [local])

  useEffect(
    () => () => {
      cancelFrame()
      endGroup()
    },
    []
  )

  const change = (next: T): void => {
    if (!grouped.current) {
      grouped.current = true
      useDeviceStore.getState().beginEdit()
    }
    editing.current = true
    setLocal(next)
  }
  // Leaving the field within the same frame as the last change would otherwise
  // lose it, since unmounting cancels the pending frame.
  const flush = (): void => {
    cancelFrame()
    if (editing.current) {
      editing.current = false
      latest.current(local)
    }
    endGroup()
  }
  return [local, change, flush]
}

/**
 * A font is chosen, never typed: the family string is the id of a library
 * entry, so a name that is not one names nothing the board could ever be given.
 * The button shows the face it stands for, which is also how an unresolved
 * family announces itself — it is the one that cannot draw itself.
 */
/**
 * The family alone. The board holds one face per family, so a size is a
 * property of the widget that draws the text and not of the font — the two are
 * only side by side where a widget is being edited.
 *
 * The wrapper is deliberately the same markup NumberField uses, so the control
 * lines up with a size beside it instead of lining up by coincidence.
 */
export function FontFamilyField({ label = 'Font', family, onChange }: { label?: string; family?: string; onChange: (family: string) => void }): React.JSX.Element {
  const [picking, setPicking] = useState(false)
  const entries = useFontLibraryStore((state) => state.entries)
  const loaded = useFontFaceStore((state) => state.loaded)
  const entry = findFontEntry(entries, family)
  return (
    <div className="block space-y-1 text-muted-foreground">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setPicking(true)}
        className={`flex h-8 w-full items-center justify-between gap-2 rounded-md border bg-background px-2 text-left ${entry ? 'text-foreground' : 'text-amber-500'}`}
        title={entry ? entry.id : family}
      >
        <span
          className="min-w-0 flex-1 truncate"
          style={family && loaded[family] ? { fontFamily: previewFontFamily(family) } : undefined}
        >
          {entry ? entry.name : family ? `Unresolved: ${family}` : 'Choose font…'}
        </span>
        {/* Not a caret: this opens a searchable browser, and a dropdown arrow
            would promise a list that drops down from here. */}
        <BrowseIcon />
      </button>
      {picking ? (
        <FontPicker
          value={family}
          onChoose={(chosen) => { onChange(chosen); setPicking(false) }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  )
}

function BrowseIcon(): React.JSX.Element {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.2 10.2 13.5 13.5" />
    </svg>
  )
}

/**
 * A font as a widget carries one: the family, and the size that widget draws it
 * at.
 */
export function FontEditor({ font, onChange }: { font?: FontSpec; onChange: (font: FontSpec) => void }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
      <FontFamilyField family={font?.family} onChange={(family) => onChange({ ...font, family })} />
      <NumberField label="Size" value={font?.size_px ?? 16} min={1} max={MAXIMUM_FONT_SIZE_PX} onChange={(size_px) => onChange({ ...font, size_px })} />
    </div>
  )
}

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
