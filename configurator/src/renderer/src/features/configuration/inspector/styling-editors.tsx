import type { FramedWidgetConfiguration } from '@shared/configuration-access'
import { FILL_CORNERS_VALUES, GRADIENT_DIRECTION_VALUES, type GradientDirection, TEXT_ALIGNMENT_VALUES, WIDGET_TITLE_CAPACITY, type WidgetTitleStyle } from '@shared/configuration-schema'
import { DEFAULT_CAPTION_FONT_SIZE_PX, draftFontFamily, useDashboardEditorStore } from '../dashboard-editor'
import { IconTextField } from './IconPicker'
import { authored } from './authored'
import { Advanced, Group } from './Group'
import { HINTS } from './hints'
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
  const placed =
    authored(widget.title?.offset_x_px, 0) ||
    authored(widget.title?.offset_y_px, 0) ||
    authored(widget.title?.border_gap, true) ||
    authored(widget.title?.gap_padding_px, 4)
  return (
    <Group
      id="Title"
      title="Title"
      icon={GROUP_ICONS.title}
      hint={HINTS.title.text}
      summary={widget.title?.text || 'None'}
      defaultOpen={Boolean(widget.title?.text)}
    >
      <IconTextField label="Text" capacity={WIDGET_TITLE_CAPACITY} value={widget.title?.text ?? ''} modified={authored(widget.title?.text, '')} onReset={() => update((next) => { delete next.title })} onChange={(value) => update((next) => {
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
          <FontEditor font={widget.title.font} defaultSizePx={DEFAULT_CAPTION_FONT_SIZE_PX} hint={HINTS.title.font} onChange={(font) => update((next) => { next.title = { ...next.title, font } })} />
          <ColorField label="Color" value={widget.title.color ?? '#E8E8E8'} modified={authored(widget.title.color, '#E8E8E8')} onReset={() => update((next) => { if (next.title) delete next.title.color })} onChange={(value) => update((next) => { next.title = { ...next.title, color: value } })} />
          <SelectField label="Anchor" hint={HINTS.title.alignment} value={widget.title.alignment ?? 'top_center'} options={TEXT_ALIGNMENT_VALUES} modified={authored(widget.title.alignment, 'top_center')} onReset={() => update((next) => { if (next.title) delete next.title.alignment })} onChange={(value) => update((next) => {
            const title: WidgetTitleStyle = { ...next.title, alignment: value }
            if (title.alignment === 'top_center') delete title.alignment
            next.title = title
          })} />
          <Advanced id="Title" active={placed}>
            <PropertyRow
              label="Offset"
              hint={HINTS.title.offset}
              modified={authored(widget.title.offset_x_px, 0) || authored(widget.title.offset_y_px, 0)}
              onReset={() => update((next) => {
                if (!next.title) return
                delete next.title.offset_x_px
                delete next.title.offset_y_px
              })}
            >
              <div className="grid grid-cols-2 gap-1">
                <NumberInput title="X offset" value={widget.title.offset_x_px ?? 0} onChange={(value) => update((next) => {
                  const title: WidgetTitleStyle = { ...next.title, offset_x_px: value }
                  if (value === 0) delete title.offset_x_px
                  next.title = title
                })} />
                <NumberInput title="Y offset" value={widget.title.offset_y_px ?? 0} onChange={(value) => update((next) => { next.title = { ...next.title, offset_y_px: value } })} />
              </div>
              <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>X</span><span>Y</span></div>
            </PropertyRow>
            <CheckboxField label="Cut border" hint={HINTS.title.cut} checked={borderGap} modified={authored(widget.title.border_gap, true)} onReset={() => update((next) => { if (next.title) delete next.title.border_gap })} onChange={(checked) => update((next) => {
              const title: WidgetTitleStyle = { ...next.title, border_gap: checked }
              if (checked) delete title.border_gap
              next.title = title
            })} />
            {borderWidth > 0 && borderGap ? (
              <>
                <NumberField label="Cut padding" hint={HINTS.title.gap} suffix="px" value={widget.title.gap_padding_px ?? 4} {...fieldBounds(widget.type, 'title.gap_padding_px')} modified={authored(widget.title.gap_padding_px, 4)} onReset={() => update((next) => { if (next.title) delete next.title.gap_padding_px })} onChange={(value) => update((next) => {
                  const padding = Math.max(0, Math.round(value))
                  const title: WidgetTitleStyle = { ...next.title, gap_padding_px: padding }
                  if (padding === 4) delete title.gap_padding_px
                  next.title = title
                })} />
                {(widget.border?.radius_px ?? 0) > 0 && inCorner ? (
                  <Hint>The cut is a straight band, so a caption pushed into a rounded corner takes a bite out of it. Offset it by about the radius plus the border width to clear the curve.</Hint>
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
    <Group id="Box" title="Box" icon={GROUP_ICONS.box} summary={summary}>
      <OptionalColorField label="Background" hint={HINTS.box.background} value={widget.background_color} onChange={(value) => update((next) => { if (value) next.background_color = value; else delete next.background_color })} />
      <PropertyRow
        label="Border"
        hint={`${HINTS.box.border} ${HINTS.box.radius}`}
        modified={authored(widget.border?.width_px, 0) || authored(widget.border?.radius_px, 0)}
        onReset={() => update((next) => {
          if (!next.border) return
          delete next.border.width_px
          delete next.border.radius_px
        })}
      >
        <div className="grid grid-cols-2 gap-1">
          <NumberInput title="Border width" value={borderWidth} {...fieldBounds(widget.type, 'border.width_px')} onChange={(value) => update((next) => { next.border = { ...next.border, width_px: value } })} />
          <NumberInput title="Corner radius" value={widget.border?.radius_px ?? 0} {...fieldBounds(widget.type, 'border.radius_px')} onChange={(value) => update((next) => { next.border = { ...next.border, radius_px: value } })} />
        </div>
        <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>Width</span><span>Radius</span></div>
      </PropertyRow>
      {(widget.border?.radius_px ?? 0) > 0 ? (
        <SelectField label="Fill corners" hint={HINTS.box.fillCorners} value={widget.fill_corners ?? 'rounded'} options={FILL_CORNERS_VALUES} modified={authored(widget.fill_corners, 'rounded')} onReset={() => update((next) => { delete next.fill_corners })} onChange={(value) => update((next) => { if (value === 'rounded') delete next.fill_corners; else next.fill_corners = value })} />
      ) : null}
      <ColorField label="Border color" value={widget.border?.color ?? '#AEAEAE'} modified={authored(widget.border?.color, '#AEAEAE')} onReset={() => update((next) => { if (next.border) delete next.border.color })} onChange={(value) => update((next) => { next.border = { ...next.border, color: value } })} />
      <Advanced id="Box" active={detailed}>
        <PropertyRow
          label="Padding X"
          hint={HINTS.box.padding}
          modified={authored(widget.padding?.left, 0) || authored(widget.padding?.right, 0)}
          onReset={() => update((next) => {
            if (!next.padding) return
            delete next.padding.left
            delete next.padding.right
          })}
        >
          <div className="grid grid-cols-2 gap-1">
            <NumberInput title="Padding left" value={widget.padding?.left ?? 0} min={0} onChange={(value) => update((next) => { next.padding = { ...next.padding, left: value } })} />
            <NumberInput title="Padding right" value={widget.padding?.right ?? 0} min={0} onChange={(value) => update((next) => { next.padding = { ...next.padding, right: value } })} />
          </div>
          <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>Left</span><span>Right</span></div>
        </PropertyRow>
        <PropertyRow
          label="Padding Y"
          modified={authored(widget.padding?.top, 0) || authored(widget.padding?.bottom, 0)}
          onReset={() => update((next) => {
            if (!next.padding) return
            delete next.padding.top
            delete next.padding.bottom
          })}
        >
          <div className="grid grid-cols-2 gap-1">
            <NumberInput title="Padding top" value={widget.padding?.top ?? 0} min={0} onChange={(value) => update((next) => { next.padding = { ...next.padding, top: value } })} />
            <NumberInput title="Padding bottom" value={widget.padding?.bottom ?? 0} min={0} onChange={(value) => update((next) => { next.padding = { ...next.padding, bottom: value } })} />
          </div>
          <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground"><span>Top</span><span>Bottom</span></div>
        </PropertyRow>
        <NumberField label="Inset" hint={HINTS.box.inset} suffix="px" value={widget.background_inset_px ?? 0} min={0} modified={authored(widget.background_inset_px, 0)} onReset={() => update((next) => { delete next.background_inset_px })} onChange={(value) => update((next) => {
          const inset = Math.max(0, Math.round(value))
          if (inset === 0) delete next.background_inset_px
          else next.background_inset_px = inset
        })} />
        {widget.background_color ? (
          <>
            <OptionalColorField
              label="Gradient to"
              hint={HINTS.box.gradient}
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
                label="Axis"
                hint={HINTS.box.axis}
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
