import { useEffect, useId, useRef, useState } from 'react'
import { type RgbColor, WIDGET_ID_CAPACITY } from '@shared/configuration-schema'
import { ColorPicker } from './ColorPicker'
import { PropertyRow, type PropertyMeta } from './PropertyRow'
import { useDeviceStore } from '@/features/device/device-store'

export const CONTROL = 'h-7 w-full min-w-0 rounded-md border bg-background px-2 text-foreground'

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

function SliderInput({ id, value, min, max, step, title, onChange }: { id?: string; value: number; min: number; max: number; step?: number; title?: string; onChange: (value: number) => void }): React.JSX.Element {
  const [local, change, flush] = useLiveCommit(value, onChange)
  return <input id={id} type="range" title={title} className="h-7 min-w-0 flex-1 accent-sky-400" value={Math.min(Math.max(local, min), max)} min={min} max={max} step={step ?? 1} onChange={(event) => change(Number(event.target.value))} onPointerUp={flush} onKeyUp={flush} onBlur={flush} />
}

export function SliderField({ label, value, min, max, softMin, softMax, step, suffix, caption, onChange, ...meta }: PropertyMeta & { label: string; value: number; min: number; max: number; softMin?: number; softMax?: number; step?: number; suffix?: string; caption?: string; onChange: (value: number) => void }): React.JSX.Element {
  return (
    <PropertyRow label={label} {...meta}>
      <div className="flex items-center gap-1.5">
        <SliderInput title={suffix ? `${label} in ${suffix}` : label} value={value} min={softMin ?? min} max={softMax ?? max} step={step} onChange={onChange} />
        <div className="w-16 flex-none">
          <NumberInput title={suffix ? `${label} in ${suffix}` : label} value={value} min={min} max={max} step={step} onChange={onChange} />
        </div>
      </div>
      {caption ? <p className="pt-1 text-[10px] text-muted-foreground">{caption}</p> : null}
    </PropertyRow>
  )
}

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

export function NumberField({ label, value, min, max, step, suffix, onChange, ...meta }: PropertyMeta & { label: string; value: number; min?: number; max?: number; step?: number | 'any'; suffix?: string; onChange: (value: number) => void }): React.JSX.Element {
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

function ColorControl({ id, label, value, onChange }: { id?: string; label: string; value: string; onChange: (value: RgbColor) => void }): React.JSX.Element {
  const [local, change, flush] = useLiveCommit(value, (next) => onChange(next as RgbColor))
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <ColorPicker value={local} label={label} onChange={change} onClose={flush} />
      <input id={id} className={CONTROL} value={local} onChange={(event) => change(event.target.value)} onBlur={flush} />
    </div>
  )
}

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

export function OptionalColorField({ label, value, onChange, hint }: { label: string; value?: string; onChange: (value: RgbColor | undefined) => void; hint?: string }): React.JSX.Element {
  const id = useId()
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

const SETTLE_MS = 200

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
  const endGroup = (): void => {
    if (!grouped.current) return
    grouped.current = false
    useDeviceStore.getState().endEdit()
  }

  useEffect(() => {
    if (!editing.current) return
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

export { FontEditor, FontFamilyField, FontFamilyPicker } from './font-fields'
