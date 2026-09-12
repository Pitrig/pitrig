import { Plus, Trash2 } from 'lucide-react'
import { ConditionsEditor } from './ConditionsEditor'
import { SlotPagesEditor } from './SlotPagesEditor'
import { pagesOf, widgetsOf } from '@shared/configuration-access'
import { type ImageWidgetConfiguration, MAXIMUM_TEXT_SOURCES, SHAPE_KIND_VALUES, type ShapeWidgetConfiguration, type SlotWidgetConfiguration, TEXT_ALIGNMENT_VALUES, type TextWidgetConfiguration } from '@shared/configuration-schema'
import { DEFAULT_WIDGET_FONT_SIZE_PX, type WidgetSelection, mutateSelectedWidget } from '../dashboard-editor'
import { SourceEditor, TelemetryBindingField } from './TelemetryBindingField'
import { authored } from './authored'
import { Group } from './Group'
import { t } from '@shared/ui-text'
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
  const names = installed.map(({ name }) => name)
  const choices = widget.image && !names.includes(widget.image) ? [widget.image, ...names] : names
  return (
    <>
      <Group id="Image" title={t('firmware.firmwarePage.image')} icon={GROUP_ICONS.image} summary={widget.image || t('inspector.widgetEditors.unassigned')}>
        <SelectField label={t('inspector.widgetEditors.bitmap')} hint={t('inspector.hints.image.image')} block value={widget.image ?? ''} options={choices} modified={authored(widget.image, '')} onReset={() => update((next) => { delete next.image })} onChange={(value) => update((next) => { if (value) next.image = value; else delete next.image })} />
        {installed.length === 0 ? <Hint>{t('inspector.widgetEditors.uploadImagesToTheBoard')}</Hint> : null}
        {widget.image && !known && installed.length > 0 ? <Hint>{t('inspector.widgetEditors.imageIsNotInstalledOn', { image: widget.image ?? '' })}</Hint> : null}
        {known ? <p className="text-muted-foreground">{`${known.width} × ${known.height} · ${known.format}${sheet ? ` · ${frames} frames` : ''}`}</p> : null}
        {sheet ? (
          <>
            <TelemetryBindingField label={t('inspector.widgetEditors.frameFrom')} hint={t('inspector.hints.image.frameSource')} value={frameBinding} onReset={() => update((next) => { delete next.sprite_frame_source })} onChange={(value) => update((next) => {
              if (!value) { delete next.sprite_frame_source; return }
              next.sprite_frame_source = { ...next.sprite_frame_source, binding: value }
              delete next.sprite_frame
            })} />
            {frameBinding ? null : (
              <NumberField label={t('modules.effectEditor.frame')} hint={t('inspector.hints.image.frame')} value={widget.sprite_frame ?? 0} min={0} max={frames - 1} modified={authored(widget.sprite_frame, 0)} onReset={() => update((next) => { delete next.sprite_frame })} onChange={(value) => update((next) => { next.sprite_frame = Math.min(frames - 1, Math.max(0, Math.round(value))) })} />
            )}
          </>
        ) : null}
        {!sheet && (widget.sprite_frame !== undefined || widget.sprite_frame_source !== undefined) ? (
          <div className="flex items-start gap-1">
            <Hint>{t('inspector.widgetEditors.imageHasASingleFrame', { image: widget.image ?? '' })}</Hint>
            <RemoveButton label={t('inspector.propertyRow.clearLabel', { label: t('modules.effectEditor.frame') })} onClick={() => update((next) => {
              delete next.sprite_frame
              delete next.sprite_frame_source
            })} />
          </div>
        ) : null}
        <OptionalColorField label={t('inspector.widgetEditors.recolor')} hint={t('inspector.hints.image.recolor')} value={widget.recolor} onChange={(value) => update((next) => { if (value) next.recolor = value; else { delete next.recolor; delete next.recolor_opa } })} />
        {widget.recolor ? <NumberField label={t('inspector.widgetEditors.strength')} hint={t('inspector.hints.image.strength')} value={widget.recolor_opa ?? 255} min={0} max={255} modified={authored(widget.recolor_opa, 255)} onReset={() => update((next) => { delete next.recolor_opa })} onChange={(value) => update((next) => { next.recolor_opa = Math.min(255, Math.max(0, Math.round(value))) })} /> : null}
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
      {/* eslint-disable-next-line no-restricted-syntax */}
      <Group id="Shape" title={t('inspector.indicatorEditor.shape')} icon={GROUP_ICONS.shape} summary={widget.kind ?? 'rectangle'}>
        <SelectField label={t('inspector.widgetEditors.kind')} hint={t('inspector.hints.shape.kind')} value={widget.kind ?? 'rectangle'} options={SHAPE_KIND_VALUES} modified={authored(widget.kind, 'rectangle')} onReset={() => update((next) => { delete next.kind })} onChange={(value) => update((next) => { next.kind = value })} />
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
            ? t('inspector.widgetEditors.thisShapeHoldsNoWidgets')
            : t('inspector.widgetEditors.holdsHeldWidgetSPlaced', { held: held })
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
        summary={t('inspector.widgetEditors.theSlotDrawsNothingItself')}
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
        title={t('inspector.sectionEditors.data')}
        icon={GROUP_ICONS.data}
        hint={t('inspector.hints.text.sources')}
        summary={sources.length > 1 ? t('inspector.widgetEditors.lengthSources', { length: sources.length }) : sources[0]?.binding || t('inspector.widgetEditors.unbound')}
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
          <AddButton label={t('inspector.widgetEditors.addSource')} onClick={() => update((next) => {
            next.sources = [...(next.sources ?? []), {}]
          })} />
        ) : null}
      </Group>
      <Group id="Value" title={t('inspector.conditionsEditor.value')} icon={GROUP_ICONS.value}>
        <FontEditor font={widget.value?.font} defaultSizePx={DEFAULT_WIDGET_FONT_SIZE_PX} onChange={(font) => update((next) => { next.value = { ...next.value, font } })} />
        <ColorField label={t('inspector.stylingEditors.color')} value={widget.value?.color ?? '#E8E8E8'} modified={authored(widget.value?.color, '#E8E8E8')} onReset={() => update((next) => { if (next.value) delete next.value.color })} onChange={(value) => update((next) => { next.value = { ...next.value, color: value } })} />
        <SelectField label={t('inspector.widgetEditors.alignment')} hint={t('inspector.hints.text.alignment')} value={widget.value?.alignment ?? 'center'} options={TEXT_ALIGNMENT_VALUES} modified={authored(widget.value?.alignment, 'center')} onReset={() => update((next) => { if (next.value) delete next.value.alignment })} onChange={(value) => update((next) => { next.value = { ...next.value, alignment: value } })} />
        <TextField label={t('inspector.widgetEditors.fallback')} hint={t('inspector.hints.text.fallback')} value={widget.value?.unavailable_text ?? ''} modified={authored(widget.value?.unavailable_text, '')} onReset={() => update((next) => { if (next.value) delete next.value.unavailable_text })} onChange={(value) => update((next) => { next.value = { ...next.value, unavailable_text: value } })} />
      </Group>
      <TitleEditor widget={widget} update={update} />
      <BoxEditor widget={widget} update={update} />
      <ConditionsEditor widget={widget} update={update} />
    </>
  )
}

export { ArcEditor, BarEditor, GraphEditor } from './gauge-editors'
export { IndicatorEditor } from './indicator-editor'
