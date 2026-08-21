import { Trash2 } from 'lucide-react'
import { type TextSourceConfiguration, type ValueTransform } from '@shared/configuration-schema'
import { TELEMETRY_CATALOG, type TelemetryCatalogEntry } from '@shared/telemetry-catalog'
import { MAXIMUM_TRANSFORM_DECIMALS, unitPresetsFor } from '@shared/value-transform'
import { authored } from './authored'
import { HINTS } from './hints'
import { PropertyRow } from './PropertyRow'
import { NumberInput, SelectField, TextInput } from './fields'
import { TelemetryBindingField } from './TelemetryBindingField'

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
          <button type="button" aria-label={`Remove source ${index + 1}`} title="Remove this source" className="rounded-md border p-1 text-muted-foreground hover:text-foreground" onClick={onRemove}>
            <Trash2 aria-hidden className="size-3" />
          </button>
        ) : null}
      </div>
      <TelemetryBindingField value={source.binding ?? ''} onReset={() => onChange((next) => { delete next.binding })} onChange={(value) => onChange((next) => {
        next.binding = value
        const selected = TELEMETRY_CATALOG.find(({ name }) => name === value)
        // An unrecognized name is left alone: the binding is mid-edit, not wrong.
        if (selected && next.transform && !transformOptions(selected).includes(transformSelection(next.transform))) {
          clearTransformType(next.transform)
          pruneTransform(next)
        }
      })} />
      <SelectField label="Modifier" hint={HINTS.data.modifier} value={source.modifiers?.some(({ type }) => type === 'lap_timer') ? 'lap_timer' : 'none'} options={['none', 'lap_timer']} modified={source.modifiers !== undefined} onReset={() => onChange((next) => { delete next.modifiers })} onChange={(value) => onChange((next) => {
        if (value === 'lap_timer') { next.binding = 'session.lap.current_time'; next.modifiers = [{ type: 'lap_timer' }] }
        else delete next.modifiers
      })} />
      <SelectField label="Transform" hint={HINTS.text.transform} value={transformSelection(source.transform)} options={transforms} modified={transformSelection(source.transform) !== 'source_text'} onReset={() => onChange((next) => {
        if (!next.transform) return
        clearTransformType(next.transform)
        pruneTransform(next)
      })} onChange={(value) => onChange((next) => {
        const transform = next.transform ?? {}
        clearTransformType(transform)
        if (value === 'number') transform.type = 'number'
        else if (value !== 'source_text') { transform.type = 'time'; transform.format = value as 'duration_ms' | 'signed_duration_ms' }
        next.transform = transform
        pruneTransform(next)
      })} />
      {source.transform?.type === 'number' ? (
        <>
          {presets.length > 0 ? <SelectField label="Preset" hint={HINTS.text.preset} value={presets.find(({ scale, offset }) => scale === source.transform?.scale && offset === (source.transform?.offset ?? 0))?.label ?? ''} options={presets.map(({ label }) => label)} onChange={(label) => onChange((next) => {
            const preset = presets.find((entry) => entry.label === label)
            if (!preset || !next.transform) return
            next.transform.scale = preset.scale
            next.transform.offset = preset.offset
            next.transform.suffix = preset.suffix
          })} /> : null}
          {/* Three numbers of one formula, so they share a row and name
              themselves under it rather than each taking a row of its own. */}
          <PropertyRow
            label="Number"
            hint={HINTS.text.scale}
            modified={authored(source.transform.decimals, 0) || authored(source.transform.scale, 1) || authored(source.transform.offset, 0)}
            onReset={() => onChange((next) => {
              if (!next.transform) return
              delete next.transform.decimals
              delete next.transform.scale
              delete next.transform.offset
            })}
          >
            <div className="grid grid-cols-3 gap-1">
              <NumberInput title="Decimals" value={source.transform.decimals ?? 0} min={0} max={MAXIMUM_TRANSFORM_DECIMALS} onChange={(value) => onChange((next) => { if (next.transform) next.transform.decimals = Math.min(MAXIMUM_TRANSFORM_DECIMALS, Math.max(0, Math.round(value))) })} />
              <NumberInput title="Scale" value={source.transform.scale ?? 1} step="any" onChange={(value) => onChange((next) => { if (next.transform) next.transform.scale = value })} />
              <NumberInput title="Offset" value={source.transform.offset ?? 0} step="any" onChange={(value) => onChange((next) => { if (next.transform) next.transform.offset = value })} />
            </div>
            <div className="grid grid-cols-3 gap-1 pt-0.5 text-[10px] text-muted-foreground">
              <span>Decimals</span><span>Scale</span><span>Offset</span>
            </div>
          </PropertyRow>
        </>
      ) : null}
      <PropertyRow
        label="Affixes"
        hint={HINTS.text.affix}
        modified={authored(source.transform?.prefix, '') || authored(source.transform?.suffix, '')}
        onReset={() => onChange((next) => {
          if (!next.transform) return
          delete next.transform.prefix
          delete next.transform.suffix
          pruneTransform(next)
        })}
      >
        <div className="grid grid-cols-2 gap-1">
          <TextInput placeholder="Prefix" value={source.transform?.prefix ?? ''} onChange={affix('prefix')} />
          <TextInput placeholder="Suffix" value={source.transform?.suffix ?? ''} onChange={affix('suffix')} />
        </div>
      </PropertyRow>
    </div>
  )
}

// Gap between the input and its popup, and the bounds the popup is allowed to
// take: enough rows to be worth scrolling, never more than a quarter screen.


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
