import { Plus, Trash2 } from 'lucide-react'
import { ConditionsEditor } from './ConditionsEditor'
import { SlotPagesEditor } from './SlotPagesEditor'
import { pagesOf, widgetsOf } from '@shared/configuration-access'
import { type ImageWidgetConfiguration, MAXIMUM_TEXT_SOURCES, SHAPE_KIND_VALUES, type ShapeWidgetConfiguration, type SlotWidgetConfiguration, TEXT_ALIGNMENT_VALUES, type TextWidgetConfiguration } from '@shared/configuration-schema'
import { DEFAULT_WIDGET_FONT_SIZE_PX, type WidgetSelection, mutateSelectedWidget } from '../dashboard-editor'
import { SourceEditor, TelemetryBindingField } from './TelemetryBindingField'
import { authored } from './authored'
import { Group } from './Group'
import { HINTS } from './hints'
import { GROUP_ICONS } from './icons'
import { ColorField, FontEditor, Hint, NumberField, OptionalColorField, SelectField, TextField } from './fields'
import { ContainerEditor } from './section-editors'
import { BoxEditor, TitleEditor } from './styling-editors'
import { useDeviceStore } from '@/features/device/device-store'

export function AddButton({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <button type="button" className="flex h-7 w-full items-center justify-center gap-1 rounded-md border text-foreground hover:bg-muted" onClick={onClick}>
      <Plus aria-hidden className="size-3" />
      {label}
    </button>
  )
}

export function RemoveButton({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} className="flex-none rounded-md border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40" onClick={onClick}>
      <Trash2 aria-hidden className="size-3" />
    </button>
  )
}

export function ImageEditor({ selection, widget }: { selection: WidgetSelection; widget: ImageWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: ImageWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as ImageWidgetConfiguration))
  const installed = useDeviceStore((state) => state.session?.imageAssets?.images) ?? []
  const known = installed.find(({ name }) => name === widget.image)
  const frames = known?.frameCount ?? 1
  const sheet = frames > 1
  const frameBinding = widget.sprite_frame_source?.binding ?? ''
  return (
    <>
      <Group id="Image" title="Image" icon={GROUP_ICONS.image} summary={widget.image || 'Unassigned'}>
        <SelectField label="Bitmap" hint={HINTS.image.image} block value={widget.image ?? ''} options={['', ...installed.map(({ name }) => name)]} modified={authored(widget.image, '')} onReset={() => update((next) => { delete next.image })} onChange={(value) => update((next) => { if (value) next.image = value; else delete next.image })} />
        {installed.length === 0 ? <Hint>Upload images to the board to choose one here.</Hint> : null}
        {widget.image && !known && installed.length > 0 ? <Hint>{`"${widget.image}" is not installed on the connected board, so the device will refuse this configuration.`}</Hint> : null}
        {known ? <p className="text-muted-foreground">{`${known.width} × ${known.height} · ${known.format}${sheet ? ` · ${frames} frames` : ''}`}</p> : null}
        {sheet ? (
          <>
            <TelemetryBindingField label="Frame from" hint={HINTS.image.frameSource} value={frameBinding} onReset={() => update((next) => { delete next.sprite_frame_source })} onChange={(value) => update((next) => {
              if (!value) { delete next.sprite_frame_source; return }
              next.sprite_frame_source = { ...next.sprite_frame_source, binding: value }
              delete next.sprite_frame
            })} />
            {frameBinding ? null : (
              <NumberField label="Frame" hint={HINTS.image.frame} value={widget.sprite_frame ?? 0} min={0} max={frames - 1} modified={authored(widget.sprite_frame, 0)} onReset={() => update((next) => { delete next.sprite_frame })} onChange={(value) => update((next) => { next.sprite_frame = Math.min(frames - 1, Math.max(0, Math.round(value))) })} />
            )}
          </>
        ) : null}
        {!sheet && (widget.sprite_frame || widget.sprite_frame_source) ? <Hint>{`"${widget.image}" has a single frame, so the device will refuse a frame or a frame source on it.`}</Hint> : null}
        <OptionalColorField label="Recolor" hint={HINTS.image.recolor} value={widget.recolor} onChange={(value) => update((next) => { if (value) next.recolor = value; else { delete next.recolor; delete next.recolor_opa } })} />
        {widget.recolor ? <NumberField label="Strength" hint={HINTS.image.strength} value={widget.recolor_opa ?? 255} min={0} max={255} modified={authored(widget.recolor_opa, 255)} onReset={() => update((next) => { delete next.recolor_opa })} onChange={(value) => update((next) => { next.recolor_opa = Math.min(255, Math.max(0, Math.round(value))) })} /> : null}
      </Group>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

export function ShapeEditor({ selection, widget }: { selection: WidgetSelection; widget: ShapeWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: ShapeWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as ShapeWidgetConfiguration))
  const held = widgetsOf(widget).length
  return (
    <>
      <Group id="Shape" title="Shape" icon={GROUP_ICONS.shape} summary={widget.kind ?? 'rectangle'}>
        <SelectField label="Kind" hint={HINTS.shape.kind} value={widget.kind ?? 'rectangle'} options={SHAPE_KIND_VALUES} modified={authored(widget.kind, 'rectangle')} onReset={() => update((next) => { delete next.kind })} onChange={(value) => update((next) => { next.kind = value })} />
      </Group>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
      <ContainerEditor
        widget={widget}
        update={update}
        count={held}
        summary={
          held === 0
            ? 'This shape holds no widgets. Select some and wrap them to make it a container; an empty one with an action is an invisible tap zone.'
            : `Holds ${held} widget(s), placed relative to this box.`
        }
      />
    </>
  )
}

export function SlotEditor({ selection, widget }: { selection: WidgetSelection; widget: SlotWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: SlotWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as SlotWidgetConfiguration))
  const pages = pagesOf(widget)
  return (
    <>
      <ContainerEditor
        widget={widget}
        update={update}
        count={pages.reduce((total, page) => total + widgetsOf(page).length, 0)}
        summary="The slot draws nothing itself — put a shape behind it for a background. Every page is this box, and its widgets are placed relative to it."
      />
      {widget.id ? <SlotPagesEditor slotId={widget.id} pages={pages} /> : null}
    </>
  )
}

export function TextEditor({ selection, widget }: { selection: WidgetSelection; widget: TextWidgetConfiguration }): React.JSX.Element {
  const update = (mutation: (next: TextWidgetConfiguration) => void): void => mutateSelectedWidget(selection, (next) => mutation(next as TextWidgetConfiguration))
  const sources = widget.sources ?? []
  return (
    <>
      <Group
        id="Data"
        title="Data"
        icon={GROUP_ICONS.data}
        hint={HINTS.text.sources}
        summary={sources.length > 1 ? `${sources.length} sources` : sources[0]?.binding || 'Unbound'}
      >
        {sources.map((source, index) => (
          <SourceEditor
            key={index}
            source={source}
            index={index}
            removable={sources.length > 1}
            onChange={(mutation) => update((next) => {
              const list = next.sources ?? []
              if (list[index]) mutation(list[index])
            })}
            onRemove={() => update((next) => {
              next.sources = (next.sources ?? []).filter((_, position) => position !== index)
            })}
          />
        ))}
        {sources.length < MAXIMUM_TEXT_SOURCES ? (
          <AddButton label="Add source" onClick={() => update((next) => {
            next.sources = [...(next.sources ?? []), {}]
          })} />
        ) : null}
      </Group>
      <Group id="Value" title="Value" icon={GROUP_ICONS.value}>
        <FontEditor font={widget.value?.font} defaultSizePx={DEFAULT_WIDGET_FONT_SIZE_PX} onChange={(font) => update((next) => { next.value = { ...next.value, font } })} />
        <ColorField label="Color" value={widget.value?.color ?? '#E8E8E8'} modified={authored(widget.value?.color, '#E8E8E8')} onReset={() => update((next) => { if (next.value) delete next.value.color })} onChange={(value) => update((next) => { next.value = { ...next.value, color: value } })} />
        <SelectField label="Alignment" hint={HINTS.text.alignment} value={widget.value?.alignment ?? 'center'} options={TEXT_ALIGNMENT_VALUES} modified={authored(widget.value?.alignment, 'center')} onReset={() => update((next) => { if (next.value) delete next.value.alignment })} onChange={(value) => update((next) => { next.value = { ...next.value, alignment: value } })} />
        <TextField label="Fallback" hint={HINTS.text.fallback} value={widget.value?.unavailable_text ?? ''} modified={authored(widget.value?.unavailable_text, '')} onReset={() => update((next) => { if (next.value) delete next.value.unavailable_text })} onChange={(value) => update((next) => { next.value = { ...next.value, unavailable_text: value } })} />
      </Group>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

export { ArcEditor, BarEditor, GraphEditor, IndicatorEditor } from './gauge-editors'
