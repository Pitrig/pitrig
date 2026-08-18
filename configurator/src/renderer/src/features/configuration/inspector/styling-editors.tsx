import type { FramedWidget } from './types'
import { GRADIENT_DIRECTION_VALUES, type GradientDirection, TEXT_ALIGNMENT_VALUES, type WidgetTitleStyle } from '@shared/configuration-schema'
import { DEFAULT_CAPTION_FONT_SIZE_PX, draftFontFamily } from '../dashboard-editor'
import { CheckboxField, ColorField, FontEditor, Hint, NumberField, OptionalColorField, Section, SelectField, TextField } from './fields'
import { alignmentAnchor } from '../preview/preview-values'
import { useDeviceStore } from '@/features/device/device-store'

export function TitleEditor({ widget, update }: {
  widget: FramedWidget
  update: (mutation: (next: FramedWidget) => void) => void
}): React.JSX.Element {
  const borderWidth = widget.border?.width_px ?? 0
  const borderGap = widget.title?.border_gap ?? true
  // A corner anchor is the one that can land the straight cut on the curve.
  const anchor = alignmentAnchor(widget.title?.alignment ?? 'top_center')
  const inCorner = anchor.column !== 'center' && anchor.row !== 'middle'
  return (
    <Section title="Title">
      <p className="text-muted-foreground">Optional. A caption is anchored to a point on the widget&apos;s box and moved from there by the offsets; the top and bottom rows straddle their border line and cut it, while the middle row sits inside the box and cuts nothing. A panel used as a container or a tap zone usually wants none.</p>
      {/* A caption needs a font the moment it has text, and the device rejects
          the whole document over a fontless one. The first family the dashboard
          already uses is one the board is being asked for anyway, so adopting it
          keeps a new caption from invalidating the draft.

          Clearing the text drops the whole object rather than leaving an empty
          one behind: the title is optional, and a sparse document should say so
          by its absence. */}
      <TextField label="Text" value={widget.title?.text ?? ''} onChange={(value) => update((next) => {
        if (!value) {
          delete next.title
          return
        }
        const font = next.title?.font?.family
          ? next.title.font
          : {
              family: draftFontFamily(useDeviceStore.getState().draft),
              size_px: DEFAULT_CAPTION_FONT_SIZE_PX
            }
        next.title = { ...next.title, text: value, font }
      })} />
      {/* Every control below writes its property only when it differs from the
          device's own default, so a caption that sits where captions have always
          sat still costs one `text` and one `font` in the document. */}
      {widget.title?.text ? (
        <>
          <FontEditor font={widget.title.font} onChange={(font) => update((next) => { next.title = { ...next.title, font } })} />
          <ColorField label="Color" value={widget.title.color ?? '#E8E8E8'} onChange={(value) => update((next) => { next.title = { ...next.title, color: value } })} />
          <SelectField label="Alignment" value={widget.title.alignment ?? 'top_center'} options={TEXT_ALIGNMENT_VALUES} onChange={(value) => update((next) => {
            const title: WidgetTitleStyle = { ...next.title, alignment: value }
            if (title.alignment === 'top_center') delete title.alignment
            next.title = title
          })} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X offset" value={widget.title.offset_x_px ?? 0} onChange={(value) => update((next) => {
              const title: WidgetTitleStyle = { ...next.title, offset_x_px: value }
              if (value === 0) delete title.offset_x_px
              next.title = title
            })} />
            <NumberField label="Y offset" value={widget.title.offset_y_px ?? 0} onChange={(value) => update((next) => { next.title = { ...next.title, offset_y_px: value } })} />
          </div>
          <CheckboxField label="Cut border" checked={borderGap} onChange={(checked) => update((next) => {
            const title: WidgetTitleStyle = { ...next.title, border_gap: checked }
            if (checked) delete title.border_gap
            next.title = title
          })} />
          {borderWidth > 0 && borderGap ? (
            <>
              <NumberField label="Gap padding" value={widget.title.gap_padding_px ?? 4} min={0} max={240} onChange={(value) => update((next) => {
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
        </>
      ) : null}
    </Section>
  )
}

export function BoxEditor({ widget, update }: {
  widget: FramedWidget
  update: (mutation: (next: FramedWidget) => void) => void
}): React.JSX.Element {
  return (
    <Section title="Box">
      <OptionalColorField label="Background" value={widget.background_color} onChange={(value) => update((next) => { if (value) next.background_color = value; else delete next.background_color })} />
      <div className="grid grid-cols-2 gap-2">{(['left', 'top', 'right', 'bottom'] as const).map((key) => <NumberField key={key} label={`Padding ${key}`} value={widget.padding?.[key] ?? 0} min={0} onChange={(value) => update((next) => { next.padding = { ...next.padding, [key]: value } })} />)}</div>
      <div className="grid grid-cols-2 gap-2"><NumberField label="Border width" value={widget.border?.width_px ?? 0} min={0} onChange={(value) => update((next) => { next.border = { ...next.border, width_px: value } })} /><NumberField label="Radius" value={widget.border?.radius_px ?? 0} min={0} onChange={(value) => update((next) => { next.border = { ...next.border, radius_px: value } })} /></div>
      <NumberField label="Background inset" value={widget.background_inset_px ?? 0} min={0} onChange={(value) => update((next) => {
        const inset = Math.max(0, Math.round(value))
        if (inset === 0) delete next.background_inset_px
        else next.background_inset_px = inset
      })} />
      <ColorField label="Border color" value={widget.border?.color ?? '#AEAEAE'} onChange={(value) => update((next) => { next.border = { ...next.border, color: value } })} />
      {/* A gradient is the far end of the background plus an axis; without a
          background there is nothing for it to run across, so it only appears
          once one is set. On the ESP32-P4 a gradient fill falls back to the
          software renderer — a performance note, not a correctness one. */}
      {widget.background_color ? (
        <>
          <OptionalColorField
            label="Background gradient to"
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
              label="Gradient axis"
              value={widget.background_grad_dir ?? 'vertical'}
              options={GRADIENT_DIRECTION_VALUES}
              onChange={(value) =>
                update((next) => {
                  next.background_grad_dir = value as GradientDirection
                })
              }
            />
          ) : null}
        </>
      ) : null}
    </Section>
  )
}
