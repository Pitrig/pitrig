import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type TextSourceConfiguration, type ValueTransform } from '../../../../../shared/configuration-schema'
import { TELEMETRY_CATALOG, type TelemetryCatalogEntry } from '../../../../../shared/telemetry-catalog'
import { MAXIMUM_TRANSFORM_DECIMALS, unitPresetsFor } from '../../../../../shared/value-transform'
import { NumberField, SelectField, TextField } from './fields'

export function SourceEditor({ source, index, removable, onChange, onRemove }: {
  source: TextSourceConfiguration
  index: number
  removable: boolean
  onChange: (mutation: (next: TextSourceConfiguration) => void) => void
  onRemove: () => void
}): React.JSX.Element {
  const binding = TELEMETRY_CATALOG.find(({ name }) => name === source.binding)
  const transforms = transformOptions(binding)
  const presets = unitPresetsFor(binding)
  const affix = (key: 'prefix' | 'suffix') => (value: string): void => onChange((next) => {
    const transform = next.transform ?? {}
    transform[key] = value
    next.transform = transform
    pruneTransform(next)
  })
  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">Source {index + 1}</span>
        {removable ? (
          <button type="button" className="rounded-md border px-2 py-0.5 text-foreground" onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </div>
      <TelemetryBindingField value={source.binding ?? ''} onChange={(value) => onChange((next) => {
        next.binding = value
        const selected = TELEMETRY_CATALOG.find(({ name }) => name === value)
        // An unrecognized name is left alone: the binding is mid-edit, not wrong.
        if (selected && next.transform && !transformOptions(selected).includes(transformSelection(next.transform))) {
          clearTransformType(next.transform)
          pruneTransform(next)
        }
      })} />
      <SelectField label="Modifier" value={source.modifiers?.some(({ type }) => type === 'lap_timer') ? 'lap_timer' : 'none'} options={['none', 'lap_timer']} onChange={(value) => onChange((next) => {
        if (value === 'lap_timer') { next.binding = 'session.lap.current_time'; next.modifiers = [{ type: 'lap_timer' }] }
        else delete next.modifiers
      })} />
      <SelectField label="Transform" value={transformSelection(source.transform)} options={transforms} onChange={(value) => onChange((next) => {
        const transform = next.transform ?? {}
        clearTransformType(transform)
        if (value === 'number') transform.type = 'number'
        else if (value !== 'source_text') { transform.type = 'time'; transform.format = value as 'duration_ms' | 'signed_duration_ms' }
        next.transform = transform
        pruneTransform(next)
      })} />
      {source.transform?.type === 'number' ? (
        <>
          {presets.length > 0 ? <SelectField label="Unit preset" value={presets.find(({ scale, offset }) => scale === source.transform?.scale && offset === (source.transform?.offset ?? 0))?.label ?? ''} options={presets.map(({ label }) => label)} onChange={(label) => onChange((next) => {
            const preset = presets.find((entry) => entry.label === label)
            if (!preset || !next.transform) return
            next.transform.scale = preset.scale
            next.transform.offset = preset.offset
            next.transform.suffix = preset.suffix
          })} /> : null}
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Decimals" value={source.transform.decimals ?? 0} min={0} max={MAXIMUM_TRANSFORM_DECIMALS} onChange={(value) => onChange((next) => { if (next.transform) next.transform.decimals = Math.min(MAXIMUM_TRANSFORM_DECIMALS, Math.max(0, Math.round(value))) })} />
            <NumberField label="Scale" value={source.transform.scale ?? 1} step="any" onChange={(value) => onChange((next) => { if (next.transform) next.transform.scale = value })} />
            <NumberField label="Offset" value={source.transform.offset ?? 0} step="any" onChange={(value) => onChange((next) => { if (next.transform) next.transform.offset = value })} />
          </div>
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-2"><TextField label="Prefix" value={source.transform?.prefix ?? ''} onChange={affix('prefix')} /><TextField label="Suffix" value={source.transform?.suffix ?? ''} onChange={affix('suffix')} /></div>
    </div>
  )
}

// Gap between the input and its popup, and the bounds the popup is allowed to
// take: enough rows to be worth scrolling, never more than a quarter screen.
const MARGIN = 4
const MINIMUM_POPUP_PX = 160
const MAXIMUM_POPUP_PX = 256

export function TelemetryBindingField({ value, onChange }: { value: string; onChange: (value: string) => void }): React.JSX.Element {
  // A <datalist> is what this wants to be, and it was one — but its popup is a
  // browser widget rendered outside the document, so the page can neither style
  // it nor scroll it, and 227 fields were reachable only by typing. This is the
  // same control rebuilt in the document: it floats over the panel through a
  // portal, so it neither shifts the layout nor gets clipped by the inspector's
  // own scroll box, and it scrolls.
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
  // A name that already resolves is a choice, not a search, so the list stays
  // whole and the author can browse on from it.
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
      // Near the bottom of the panel there is no room underneath, and a popup
      // that runs off the viewport is a popup with no list in it. Flip it above
      // the input, which is what the native control does.
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
    // The popup is positioned in viewport coordinates, so it has to follow the
    // input when the inspector scrolls under it.
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
    <div className="space-y-1 text-muted-foreground">
      <span className="block">Binding</span>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls="telemetry-binding-list"
        className="h-8 w-full rounded-md border bg-background px-2 text-foreground"
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
              // Without this the input blurs and the list closes before the
              // option's click lands.
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
  )
}

// The device rejects a transform it cannot read, so the editor offers only the
// ones the selected binding supports: any non-boolean value can be formatted as
// a number, while each duration format accepts one millisecond type.
function transformOptions(binding: TelemetryCatalogEntry | undefined): readonly string[] {
  if (!binding) return ['source_text']
  const options = ['source_text']
  if (binding.type !== 'boolean') options.push('number')
  if (binding.unit === 'millisecond' && binding.type === 'uint32') options.push('duration_ms')
  if (binding.unit === 'millisecond' && binding.type === 'int32') options.push('signed_duration_ms')
  return options
}

/** The Transform select value: a transform may exist carrying affixes alone. */
function transformSelection(transform: ValueTransform | undefined): string {
  if (transform?.type === 'number') return 'number'
  if (transform?.type === 'time') return transform.format ?? 'duration_ms'
  return 'source_text'
}

function clearTransformType(transform: ValueTransform): void {
  transform.type = 'none'
  delete transform.format
  delete transform.decimals
  delete transform.scale
  delete transform.offset
}

/** Keeps the document sparse: a transform that formats nothing is not written. */
function pruneTransform(source: TextSourceConfiguration): void {
  const transform = source.transform
  if (transform && (transform.type ?? 'none') === 'none' && !transform.prefix && !transform.suffix) {
    delete source.transform
  }
}
