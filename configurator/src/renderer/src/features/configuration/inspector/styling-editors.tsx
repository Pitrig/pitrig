import type { FramedWidgetConfiguration } from '@shared/configuration-access'
import { FILL_CORNERS_VALUES, GRADIENT_DIRECTION_VALUES, type GradientDirection, TEXT_ALIGNMENT_VALUES, WIDGET_TITLE_CAPACITY, type WidgetTitleStyle } from '@shared/configuration-schema'
import { DEFAULT_CAPTION_FONT_SIZE_PX, draftFontFamily, useDashboardEditorStore } from '../dashboard-editor'
import { IconTextField } from './IconPicker'
import { TelemetryBindingField } from './TelemetryBindingField'
import { authored } from './authored'
import { Advanced, Group } from './Group'
import { t } from '@shared/ui-text'
import { GROUP_ICONS } from './icons'
import { PropertyRow } from './PropertyRow'
import { CheckboxField, ColorField, FontEditor, Hint, NumberField, NumberInput, OptionalColorField, SelectField } from './fields'
import { fieldBounds } from '@shared/validate/ranges'
import { alignmentAnchor } from '../preview/preview-values'
import { useDeviceStore } from '@/features/device/device-store'

export function TitleEditor({ widget, update }: {
  widget: FramedWidgetConfiguration
  update: (mutation: (next: FramedWidgetConfiguration) => void) => void
}): React.JSX.Element {
  const borderWidth = widget.border?.width_px ?? 0
  const borderGap = widget.title?.border_gap ?? true
  const anchor = alignmentAnchor(widget.title?.alignment ?? 'top_center')
  const inCorner = anchor.column !== 'center' && anchor.row !== 'middle'
  const binding = widget.title?.source?.binding ?? ''
  const placed =
    authored(widget.title?.offset_x_px, 0) ||
    authored(widget.title?.offset_y_px, 0) ||
    authored(widget.title?.border_gap, true) ||
    authored(widget.title?.gap_padding_px, 4)
  return (
    <Group
      id="Title"
      title={t('inspector.stylingEditors.title')}
      icon={GROUP_ICONS.title}
      hint={t('inspector.hints.title.text')}
      summary={widget.title?.text ? [widget.title.text, binding].filter(Boolean).join(' · ') : t('common.none')}
      defaultOpen={Boolean(widget.title?.text)}
    >
      <IconTextField label={t('modules.effectEditor.text')} capacity={WIDGET_TITLE_CAPACITY} value={widget.title?.text ?? ''} modified={authored(widget.title?.text, '')} onReset={() => update((next) => { delete next.title })} onChange={(value) => update((next) => {
        if (!value) {
          delete next.title
          return
        }
        const font = next.title?.font?.family
          ? next.title.font
          : {
              family: draftFontFamily(
                useDeviceStore.getState().draft,
                useDashboardEditorStore.getState().defaultFontFamily
              ),
              size_px: DEFAULT_CAPTION_FONT_SIZE_PX
            }
        next.title = { ...next.title, text: value, font }
      })} />
      {widget.title?.text ? (
        <>
          <TelemetryBindingField label={t('inspector.stylingEditors.textFrom')} hint={t('inspector.hints.title.source')} value={binding} onReset={() => update((next) => { if (next.title) delete next.title.source })} onChange={(value) => update((next) => {
            if (!next.title) return
            if (!value) delete next.title.source
            else next.title.source = { ...next.title.source, binding: value }
          })} />
          <FontEditor font={widget.title.font} defaultSizePx={DEFAULT_CAPTION_FONT_SIZE_PX} hint={t('inspector.hints.title.font')} onChange={(font) => update((next) => { next.title = { ...next.title, font } })} />
          <ColorField label={t('inspector.stylingEditors.color')} value={widget.title.color ?? '#E8E8E8'} modified={authored(widget.title.color, '#E8E8E8')} onReset={() => update((next) => { if (next.title) delete next.title.color })} onChange={(value) => update((next) => { next.title = { ...next.title, color: value } })} />
          <SelectField label={t('inspector.stylingEditors.anchor')} hint={t('inspector.hints.title.alignment')} value={widget.title.alignment ?? 'top_center'} options={TEXT_ALIGNMENT_VALUES} modified={authored(widget.title.alignment, 'top_center')} onReset={() => update((next) => { if (next.title) delete next.title.alignment })} onChange={(value) => update((next) => {
            const title: WidgetTitleStyle = { ...next.title, alignment: value }
            if (title.alignment === 'top_center') delete title.alignment
            next.title = title
          })} />
          <Advanced id="Title" active={placed}>
            <PropertyRow
              label={t('inspector.sourceEditor.offset')}
              hint={t('inspector.hints.title.offset')}
              modified={authored(widget.title.offset_x_px, 0) || authored(widget.title.offset_y_px, 0)}
              onReset={() => update((next) => {
                if (!next.title) return
                delete next.title.offset_x_px
                delete next.title.offset_y_px
              })}
            >
              <div className="grid grid-cols-2 gap-1">
                <NumberInput title={t('inspector.stylingEditors.xOffset')} value={widget.title.offset_x_px ?? 0} onChange={(value) => update((next) => {
                  const title: WidgetTitleStyle = { ...next.title, offset_x_px: value }
                  if (value === 0) delete title.offset_x_px
                  next.title = title
                })} />
                <NumberInput title={t('inspector.stylingEditors.yOffset')} value={widget.title.offset_y_px ?? 0} onChange={(value) => update((next) => { next.title = { ...next.title, offset_y_px: value } })} />
              </div>
              <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>X</span><span>Y</span></div>
            </PropertyRow>
            <CheckboxField label={t('inspector.stylingEditors.cutBorder')} hint={t('inspector.hints.title.cut')} checked={borderGap} modified={authored(widget.title.border_gap, true)} onReset={() => update((next) => { if (next.title) delete next.title.border_gap })} onChange={(checked) => update((next) => {
              const title: WidgetTitleStyle = { ...next.title, border_gap: checked }
              if (checked) delete title.border_gap
              next.title = title
            })} />
            {borderWidth > 0 && borderGap ? (
              <>
                <NumberField label={t('inspector.stylingEditors.cutPadding')} hint={t('inspector.hints.title.gap')} suffix="px" value={widget.title.gap_padding_px ?? 4} {...fieldBounds(widget.type, 'title.gap_padding_px')} modified={authored(widget.title.gap_padding_px, 4)} onReset={() => update((next) => { if (next.title) delete next.title.gap_padding_px })} onChange={(value) => update((next) => {
                  const padding = Math.max(0, Math.round(value))
                  const title: WidgetTitleStyle = { ...next.title, gap_padding_px: padding }
                  if (padding === 4) delete title.gap_padding_px
                  next.title = title
                })} />
                {(widget.border?.radius_px ?? 0) > 0 && inCorner ? (
                  <Hint>{t('inspector.stylingEditors.theCutIsAStraight')}</Hint>
                ) : null}
              </>
            ) : null}
          </Advanced>
        </>
      ) : null}
    </Group>
  )
}

export function BoxEditor({ widget, update }: {
  widget: FramedWidgetConfiguration
  update: (mutation: (next: FramedWidgetConfiguration) => void) => void
}): React.JSX.Element {
  const borderWidth = widget.border?.width_px ?? 0
  const detailed =
    widget.padding !== undefined ||
    authored(widget.background_inset_px, 0) ||
    widget.background_grad_color !== undefined
  const summary = [
    widget.background_color ? 'Filled' : 'No fill',
    borderWidth > 0 ? `${borderWidth} px border` : undefined
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Group id="Box" title={t('inspector.stylingEditors.box')} icon={GROUP_ICONS.box} summary={summary}>
      <OptionalColorField label={t('modules.effectColors.background')} hint={t('inspector.hints.box.background')} value={widget.background_color} onChange={(value) => update((next) => { if (value) next.background_color = value; else delete next.background_color })} />
      <PropertyRow
        label={t('inspector.conditionsEditor.border')}
        hint={t('inspector.stylingEditors.borderRadius', { border: t('inspector.hints.box.border'), radius: t('inspector.hints.box.radius') })}
        modified={authored(widget.border?.width_px, 0) || authored(widget.border?.radius_px, 0)}
        onReset={() => update((next) => {
          if (!next.border) return
          delete next.border.width_px
          delete next.border.radius_px
        })}
      >
        <div className="grid grid-cols-2 gap-1">
          <NumberInput title={t('inspector.stylingEditors.borderWidth')} value={borderWidth} {...fieldBounds(widget.type, 'border.width_px')} onChange={(value) => update((next) => { next.border = { ...next.border, width_px: value } })} />
          <NumberInput title={t('inspector.stylingEditors.cornerRadius')} value={widget.border?.radius_px ?? 0} {...fieldBounds(widget.type, 'border.radius_px')} onChange={(value) => update((next) => { next.border = { ...next.border, radius_px: value } })} />
        </div>
        <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>{t('images.stagedImageCard.width')}</span><span>{t('inspector.indicatorEditor.radius')}</span></div>
      </PropertyRow>
      {(widget.border?.radius_px ?? 0) > 0 ? (
        <SelectField label={t('inspector.stylingEditors.fillCorners')} hint={t('inspector.hints.box.fillCorners')} value={widget.fill_corners ?? 'rounded'} options={FILL_CORNERS_VALUES} modified={authored(widget.fill_corners, 'rounded')} onReset={() => update((next) => { delete next.fill_corners })} onChange={(value) => update((next) => { if (value === 'rounded') delete next.fill_corners; else next.fill_corners = value })} />
      ) : null}
      <ColorField label={t('inspector.stylingEditors.borderColor')} value={widget.border?.color ?? '#AEAEAE'} modified={authored(widget.border?.color, '#AEAEAE')} onReset={() => update((next) => { if (next.border) delete next.border.color })} onChange={(value) => update((next) => { next.border = { ...next.border, color: value } })} />
      <Advanced id="Box" active={detailed}>
        <PropertyRow
          label={t('inspector.stylingEditors.paddingX')}
          hint={t('inspector.hints.box.padding')}
          modified={authored(widget.padding?.left, 0) || authored(widget.padding?.right, 0)}
          onReset={() => update((next) => {
            if (!next.padding) return
            delete next.padding.left
            delete next.padding.right
          })}
        >
          <div className="grid grid-cols-2 gap-1">
            <NumberInput title={t('inspector.stylingEditors.paddingLeft')} value={widget.padding?.left ?? 0} min={0} onChange={(value) => update((next) => { next.padding = { ...next.padding, left: value } })} />
            <NumberInput title={t('inspector.stylingEditors.paddingRight')} value={widget.padding?.right ?? 0} min={0} onChange={(value) => update((next) => { next.padding = { ...next.padding, right: value } })} />
          </div>
          <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>{t('inspector.stylingEditors.left')}</span><span>{t('inspector.stylingEditors.right')}</span></div>
        </PropertyRow>
        <PropertyRow
          label={t('inspector.stylingEditors.paddingY')}
          modified={authored(widget.padding?.top, 0) || authored(widget.padding?.bottom, 0)}
          onReset={() => update((next) => {
            if (!next.padding) return
            delete next.padding.top
            delete next.padding.bottom
          })}
        >
          <div className="grid grid-cols-2 gap-1">
            <NumberInput title={t('inspector.stylingEditors.paddingTop')} value={widget.padding?.top ?? 0} min={0} onChange={(value) => update((next) => { next.padding = { ...next.padding, top: value } })} />
            <NumberInput title={t('inspector.stylingEditors.paddingBottom')} value={widget.padding?.bottom ?? 0} min={0} onChange={(value) => update((next) => { next.padding = { ...next.padding, bottom: value } })} />
          </div>
          <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>{t('inspector.stylingEditors.top')}</span><span>{t('inspector.stylingEditors.bottom')}</span></div>
        </PropertyRow>
        <NumberField label={t('inspector.stylingEditors.inset')} hint={t('inspector.hints.box.inset')} suffix="px" value={widget.background_inset_px ?? 0} min={0} modified={authored(widget.background_inset_px, 0)} onReset={() => update((next) => { delete next.background_inset_px })} onChange={(value) => update((next) => {
          const inset = Math.max(0, Math.round(value))
          if (inset === 0) delete next.background_inset_px
          else next.background_inset_px = inset
        })} />
        {widget.background_color ? (
          <>
            <OptionalColorField
              label={t('inspector.gaugeEditors.gradientTo')}
              hint={t('inspector.hints.box.gradient')}
              value={widget.background_grad_color}
              onChange={(value) =>
                update((next) => {
                  if (value) next.background_grad_color = value
                  else {
                    delete next.background_grad_color
                    delete next.background_grad_dir
                  }
                })
              }
            />
            {widget.background_grad_color ? (
              <SelectField
                label={t('inspector.stylingEditors.axis')}
                hint={t('inspector.hints.box.axis')}
                value={widget.background_grad_dir ?? 'vertical'}
                options={GRADIENT_DIRECTION_VALUES}
                modified={authored(widget.background_grad_dir, 'vertical')}
                onReset={() => update((next) => { delete next.background_grad_dir })}
                onChange={(value) =>
                  update((next) => {
                    next.background_grad_dir = value as GradientDirection
                  })
                }
              />
            ) : null}
          </>
        ) : null}
      </Advanced>
    </Group>
  )
}
