import { useEffect, useId, useRef, useState } from 'react'
import { type FontSpec, type RgbColor, WIDGET_ID_CAPACITY } from '@shared/configuration-schema'
import { MAXIMUM_FONT_SIZE_PX } from '@shared/font-assets'
import { authored } from './authored'
import { ColorPicker } from './ColorPicker'
import { PropertyRow, type PropertyMeta } from './PropertyRow'
import { draftFontFamily, useDashboardEditorStore } from '../dashboard-editor'
import { useDeviceStore } from '@/features/device/device-store'
import { FontPicker } from '@/features/font-library/FontPicker'
import { previewFontFamily, useFontFaceStore } from '@/features/font-library/font-face-store'
import { findFontEntry, useFontLibraryStore } from '@/features/font-library/font-library-store'

/**
 * The controls the inspector is built from. Each one is a bare input plus the
 * row that names it, kept separate so the few places that put two values on one
 * line — a position, a font and its size — reuse the input without inheriting a
 * second name column.
 */

/** One height for every control, so a column of them lines up. */
const CONTROL = 'h-7 w-full min-w-0 rounded-md border bg-background px-2 text-foreground'

export function Hint({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="rounded-md border p-2 text-muted-foreground">{children}</p>
}

export function TextInput({ id, value, onChange, placeholder }: { id?: string; value: string; onChange: (value: string) => void; placeholder?: string }): React.JSX.Element {
  const [local, change, flush] = useLiveCommit(value, onChange)
  return <input id={id} className={CONTROL} placeholder={placeholder} value={local} onChange={(event) => change(event.target.value)} onBlur={flush} />
}

export function NumberInput({ id, value, min, max, step, title, onChange }: { id?: string; value: number; min?: number; max?: number; step?: number | 'any'; title?: string; onChange: (value: number) => void }): React.JSX.Element {
  const [local, change, flush] = useLiveCommit(value, onChange)
  return <input id={id} type="number" title={title} className={CONTROL} value={local} min={min} max={max} step={step} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) change(next) }} onBlur={flush} />
}

// Generic over the option type, so a caller that passes the schema's own value
// list gets that type back in onChange instead of a bare string it has to cast.
export function SelectInput<T extends string>({ id, value, options, onChange }: { id?: string; value: string; options: readonly T[]; onChange: (value: T) => void }): React.JSX.Element {
  return (
    <select id={id} className={CONTROL} value={value} onChange={(event) => onChange(event.target.value as T)}>
      {value === '' ? <option value="">Not set</option> : null}
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  )
}

export function TextField({ label, value, onChange, placeholder, block, ...meta }: PropertyMeta & { label: string; value: string; onChange: (value: string) => void; placeholder?: string; block?: boolean }): React.JSX.Element {
  const id = useId()
  return (
    <PropertyRow label={label} controlId={id} block={block} {...meta}>
      <TextInput id={id} value={value} onChange={onChange} placeholder={placeholder} />
    </PropertyRow>
  )
}

export function NumberField({ label, value, min, max, step, suffix, onChange, ...meta }: PropertyMeta & { label: string; value: number; min?: number; max?: number; step?: number | 'any'; /** The unit, drawn after the input rather than inside the name. */ suffix?: string; onChange: (value: number) => void }): React.JSX.Element {
  const id = useId()
  return (
    <PropertyRow label={label} controlId={id} {...meta}>
      {suffix ? (
        <div className="flex items-center gap-1">
          <NumberInput id={id} value={value} min={min} max={max} step={step} onChange={onChange} />
          <span className="flex-none text-[10px] text-muted-foreground">{suffix}</span>
        </div>
      ) : (
        <NumberInput id={id} value={value} min={min} max={max} step={step} onChange={onChange} />
      )}
    </PropertyRow>
  )
}

export function SelectField<T extends string>({ label, value, options, onChange, block, ...meta }: PropertyMeta & { label: string; value: string; options: readonly T[]; onChange: (value: T) => void; block?: boolean }): React.JSX.Element {
  const id = useId()
  return (
    <PropertyRow label={label} controlId={id} block={block} {...meta}>
      <SelectInput id={id} value={value} options={options} onChange={onChange} />
    </PropertyRow>
  )
}

export function CheckboxField({ label, checked, onChange, ...meta }: PropertyMeta & { label: string; checked: boolean; onChange: (checked: boolean) => void }): React.JSX.Element {
  const id = useId()
  return (
    <PropertyRow label={label} controlId={id} {...meta}>
      <input id={id} type="checkbox" className="size-3.5 align-middle" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </PropertyRow>
  )
}

/**
 * A colour: the swatch that opens the picker, and the hex the device actually
 * stores. The dashboard's own colours live inside the picker rather than under
 * the field — see ColorPicker for why the browser's own popup could not hold
 * them.
 */
export function ColorControl({ id, label, value, onChange }: { id?: string; label: string; value: string; onChange: (value: RgbColor) => void }): React.JSX.Element {
  const [local, change, flush] = useLiveCommit(value, (next) => onChange(next as RgbColor))
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <ColorPicker value={local} label={label} onChange={change} onClose={flush} />
      <input id={id} className={CONTROL} value={local} onChange={(event) => change(event.target.value)} onBlur={flush} />
    </div>
  )
}

/**
 * The swatch alone, for the repeated rows — a lamp, a ramp stop — where a hex
 * field beside it would leave no room for the value it belongs to.
 */
export function ColorSwatchInput({ label, value, onChange }: { label: string; value: string; onChange: (value: RgbColor) => void }): React.JSX.Element {
  const [local, change, flush] = useLiveCommit(value, (next) => onChange(next as RgbColor))
  return <ColorPicker value={local} label={label} onChange={change} onClose={flush} />
}

export function ColorField({ label, value, onChange, ...meta }: PropertyMeta & { label: string; value: string; onChange: (value: RgbColor) => void }): React.JSX.Element {
  const id = useId()
  return (
    <PropertyRow label={label} controlId={id} {...meta}>
      <ColorControl id={id} label={label} value={value} onChange={onChange} />
    </PropertyRow>
  )
}

/**
 * A colour the document may simply not carry. The checkbox is the difference
 * between "black" and "nothing here", which is a distinction the device draws:
 * an unset track or background is not painted at all.
 */
export function OptionalColorField({ label, value, onChange, hint }: { label: string; value?: string; onChange: (value: RgbColor | undefined) => void; hint?: string }): React.JSX.Element {
  const id = useId()
  // Nothing to take from the call sites: unsetting is what the checkbox does,
  // so the dot and its reset are the same action this control already carries.
  return (
    <PropertyRow
      label={label}
      controlId={value === undefined ? id : undefined}
      hint={hint}
      modified={value !== undefined}
      onReset={() => onChange(undefined)}
    >
      <div className="flex items-center gap-1.5">
        <input id={value === undefined ? id : undefined} type="checkbox" className="size-3.5 flex-none" aria-label={`${label} set`} checked={value !== undefined} onChange={(event) => onChange(event.target.checked ? '#000000' : undefined)} />
        {value !== undefined ? <ColorControl label={label} value={value} onChange={onChange} /> : <span className="text-muted-foreground">Not set</span>}
      </div>
    </PropertyRow>
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
 *
 * The family alone. The board holds one face per family, so a size is a
 * property of the widget that draws the text and not of the font.
 */
export function FontFamilyPicker({ family, onChange }: { family?: string; onChange: (family: string) => void }): React.JSX.Element {
  const [picking, setPicking] = useState(false)
  const entries = useFontLibraryStore((state) => state.entries)
  const loaded = useFontFaceStore((state) => state.loaded)
  const entry = findFontEntry(entries, family)
  return (
    <>
      <button
        type="button"
        onClick={() => setPicking(true)}
        className={`flex h-7 w-full min-w-0 items-center justify-between gap-2 rounded-md border bg-background px-2 text-left ${entry ? 'text-foreground' : 'text-amber-500'}`}
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
    </>
  )
}

export function FontFamilyField({ label = 'Font', family, onChange, hint }: { label?: string; family?: string; onChange: (family: string) => void; hint?: string }): React.JSX.Element {
  return (
    <PropertyRow label={label} hint={hint}>
      <FontFamilyPicker family={family} onChange={onChange} />
    </PropertyRow>
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
 * at. They share a row because neither is useful without the other.
 */
export function FontEditor({ font, defaultSizePx, onChange, hint }: { font?: FontSpec; /** What this kind of text is created at: a caption and a reading differ. */ defaultSizePx: number; onChange: (font: FontSpec) => void; hint?: string }): React.JSX.Element {
  // A widget with no font at all is a document the device refuses, so "reset"
  // cannot mean "remove it". It means the dashboard's own family at the size
  // this kind of text is created with, which is what the widget would have had
  // if it had never been touched.
  const family = draftFontFamily(
    useDeviceStore((state) => state.draft),
    useDashboardEditorStore((state) => state.defaultFontFamily)
  )
  return (
    <PropertyRow
      label="Font"
      hint={hint}
      modified={authored(font?.family, family) || authored(font?.size_px, defaultSizePx)}
      onReset={() => onChange({ family, size_px: defaultSizePx })}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_3.5rem] gap-1">
        <FontFamilyPicker family={font?.family} onChange={(family) => onChange({ ...font, family })} />
        <NumberInput title="Size in pixels" value={font?.size_px ?? defaultSizePx} min={1} max={MAXIMUM_FONT_SIZE_PX} onChange={(size_px) => onChange({ ...font, size_px })} />
      </div>
    </PropertyRow>
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
  hint,
  onCommit
}: {
  label: string
  value: string
  hint?: string
  onCommit: (name: string) => boolean
}): React.JSX.Element {
  const id = useId()
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
    <PropertyRow label={label} controlId={id} hint={hint}>
      <input
        id={id}
        value={draft}
        maxLength={WIDGET_ID_CAPACITY - 1}
        className={`${CONTROL} ${rejected ? 'border-red-500' : ''}`}
        onChange={(event) => {
          setDraft(event.target.value)
          setRejected(false)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
      />
    </PropertyRow>
  )
}
