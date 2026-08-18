import { useId } from 'react'
import { type GradientDirection, type ImageWidgetConfiguration, type ShapeWidgetConfiguration, type TextWidgetConfiguration } from '@shared/configuration-schema'
import { placeholderBody, transformedBody, withAffixes } from '@shared/value-format'
import { type ResolvedStyle } from '@shared/widget-style'
import { completePlacement } from '../dashboard-editor'
import { usePreviewAssetStore } from '../preview-assets'
import { type Placement, markupId } from './canvas-geometry'
import { DEFAULT_BORDER_COLOR, DEFAULT_TEXT_COLOR, type FramedWidgetConfiguration } from './preview-theme'
import { backgroundRect, contentArea, gradientPaint } from './preview-geometry-paint'
import { type PreviewValues, alignmentAnchor, captionGeometry, fontMetrics, lvglCenterOffset, normalizeColor, resolvedFont } from './preview-values'

export function GradientDefinition({
  id,
  from,
  to,
  direction
}: {
  id: string
  from: string
  to: string
  direction: GradientDirection | undefined
}): React.JSX.Element {
  const horizontal = direction === 'horizontal'
  return (
    <linearGradient id={id} x1="0" y1="0" x2={horizontal ? '1' : '0'} y2={horizontal ? '0' : '1'}>
      <stop offset="0%" stopColor={from} />
      <stop offset="100%" stopColor={to} />
    </linearGradient>
  )
}

export function WidgetFrameShape({
  placement,
  configuration,
  style,
  radius
}: {
  placement: Placement
  configuration: FramedWidgetConfiguration
  style: ResolvedStyle
  /** Half the shorter side for an ellipse; the authored corner otherwise. */
  radius?: number
}): React.JSX.Element {
  const gradientId = markupId(useId())
  const borderWidth = configuration.border?.width_px ?? 0
  const corner = radius ?? configuration.border?.radius_px ?? 0
  const background = normalizeColor(style.backgroundColor) ?? 'transparent'
  const box = backgroundRect(
    placement,
    borderWidth,
    corner,
    configuration.background_inset_px ?? 0
  )
  const fill = gradientPaint(gradientId, background, configuration.background_grad_color)
  return (
    <>
      {fill.definition ? (
        <GradientDefinition
          id={gradientId}
          from={background}
          to={configuration.background_grad_color as string}
          direction={configuration.background_grad_dir}
        />
      ) : null}
      {background !== 'transparent' ? <rect {...box} fill={fill.paint} /> : null}
      {borderWidth > 0 ? (
        <rect
          x={placement.x + borderWidth / 2}
          y={placement.y + borderWidth / 2}
          width={placement.width - borderWidth}
          height={placement.height - borderWidth}
          rx={Math.max(0, corner - borderWidth / 2)}
          fill="none"
          stroke={style.borderColor ?? DEFAULT_BORDER_COLOR}
          strokeWidth={borderWidth}
        />
      ) : null}
    </>
  )
}

export function TextWidgetPreview({
  configuration,
  values
}: {
  configuration: TextWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const uploadedFamilies = usePreviewAssetStore((state) => state.fonts)
  const placement = completePlacement(configuration.placement)
  if (!placement) return null

  const borderWidth = configuration.border?.width_px ?? 0
  const title = configuration.title?.text ?? ''
  const titleFont = resolvedFont(configuration.title?.font, 10, uploadedFamilies)
  const valueFont = resolvedFont(configuration.value?.font, 48, uploadedFamilies)
  const content = contentArea(placement, borderWidth, configuration.padding)
  const style = values.styleFor(configuration, {
    color: configuration.value?.color ?? DEFAULT_TEXT_COLOR,
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
  const previewValue = composedText(configuration, values)

  // The device sizes the label to its text and aligns that inside the content
  // area, so the box the glyphs sit in is the string's own width by the font's
  // line height — not the widget's box. Everything below places that label the
  // way LVGL does, then draws from its baseline.
  const metrics = fontMetrics(previewValue, valueFont)
  const { column, row } = alignmentAnchor(configuration.value?.alignment ?? 'center')
  const valueX =
    column === 'left'
      ? content.x
      : column === 'right'
        ? content.x + content.width - metrics.width
        : content.x + lvglCenterOffset(content.width, metrics.width)
  // A titled widget pushes its value down by a quarter of the caption's line
  // height, which is the room the caption takes out of the top of the box.
  const titleDrop = title ? Math.trunc(fontMetrics(title, titleFont).lineHeight / 4) : 0
  const valueY =
    row === 'top'
      ? content.y
      : row === 'bottom'
        ? content.y + content.height - metrics.lineHeight
        : content.y + lvglCenterOffset(content.height, metrics.lineHeight)
  const labelTop = valueY + titleDrop

  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      <text
        x={valueX}
        y={labelTop + metrics.ascent}
        fill={style.color ?? DEFAULT_TEXT_COLOR}
        fontFamily={valueFont.family}
        fontSize={valueFont.sizePx}
        fontWeight={valueFont.weight}
      >
        {previewValue}
      </text>
    </g>
  )
}

/**
 * The device keeps two unavailability rules apart, and so does this. A source
 * that has no value falls back to its own placeholder, so a live neighbour
 * keeps updating beside it; only when *every* source is silent does the
 * widget-level `unavailable_text` replace the whole string.
 */
function composedText(configuration: TextWidgetConfiguration, values: PreviewValues): string {
  const sources = configuration.sources ?? []
  let anyAvailable = false
  const parts = sources.map(({ binding, transform }) => {
    const body = transformedBody(transform, values.read(binding))
    if (body !== undefined) anyAvailable = true
    return withAffixes(transform, body ?? placeholderBody(transform))
  })
  if (!anyAvailable && configuration.value?.unavailable_text) {
    return configuration.value.unavailable_text
  }
  return parts.join('')
}

export function ImagePreview({
  configuration,
  values
}: {
  configuration: ImageWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const recolorId = markupId(useId())
  const bitmap = usePreviewAssetStore((state) =>
    configuration.image ? state.images[configuration.image] : undefined
  )
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  const style = values.styleFor(configuration, {
    color: configuration.recolor,
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
  const tint = normalizeColor(style.color)
  if (!bitmap) {
    return (
      <g>
        <rect
          x={placement.x}
          y={placement.y}
          width={placement.width}
          height={placement.height}
          rx={configuration.border?.radius_px ?? 0}
          fill={tint && tint !== 'transparent' ? tint : '#334155'}
          fillOpacity={tint && tint !== 'transparent' ? 0.5 : 0.35}
          stroke={style.borderColor ?? DEFAULT_BORDER_COLOR}
          strokeOpacity={0.6}
          strokeDasharray="4 3"
          strokeWidth={configuration.border?.width_px || 1}
        />
        <text
          x={placement.x + placement.width / 2}
          y={placement.y + placement.height / 2}
          fill={DEFAULT_TEXT_COLOR}
          fontFamily="Arial, sans-serif"
          fontSize={Math.max(8, Math.min(placement.height / 4, 14))}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {configuration.image || 'no image'}
        </text>
      </g>
    )
  }
  const content = contentArea(placement, configuration.border?.width_px ?? 0, configuration.padding)
  const x = content.x + lvglCenterOffset(content.width, bitmap.width)
  const y = content.y + lvglCenterOffset(content.height, bitmap.height)
  // A recolour mixes the bitmap towards one colour without touching its alpha,
  // so it is the same pixels flooded and laid back over at the configured
  // strength.
  const recolored = tint !== undefined && tint !== 'transparent'
  const recolorOpacity = (configuration.recolor_opa ?? 255) / 255
  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      <image href={bitmap.dataUrl} x={x} y={y} width={bitmap.width} height={bitmap.height} />
      {recolored ? (
        <>
          <filter id={recolorId}>
            <feFlood floodColor={tint} result="flood" />
            <feComposite in="flood" in2="SourceAlpha" operator="in" />
          </filter>
          <image
            href={bitmap.dataUrl}
            x={x}
            y={y}
            width={bitmap.width}
            height={bitmap.height}
            filter={`url(#${recolorId})`}
            opacity={recolorOpacity}
          />
        </>
      ) : null}
    </g>
  )
}

// A caption belongs to the frame, so it is drawn the same way for every type
// that has one: anchored to an edge of the widget's outer box, and over a gap in
// whichever border line it ends up crossing.
export function CaptionPreview({
  configuration,
  behind
}: {
  configuration: FramedWidgetConfiguration
  /** What is painted behind the widget, which is what the mask falls back to. */
  behind: string
}): React.JSX.Element | null {
  const uploadedFamilies = usePreviewAssetStore((state) => state.fonts)
  const placement = completePlacement(configuration.placement)
  const title = configuration.title?.text
  if (!placement || !title) return null
  const font = resolvedFont(configuration.title?.font, 12, uploadedFamilies)
  const metrics = fontMetrics(title, font)
  const borderWidth = configuration.border?.width_px ?? 0
  const background = normalizeColor(configuration.background_color)
  const inset = configuration.background_inset_px ?? 0
  // A widget only covers its own frame line when it fills the container: a
  // transparent colour paints nothing, and an inset background paints an inner
  // rect that leaves the line standing on whatever is behind the widget. The
  // device resolves that by walking up to the first ancestor that paints
  // (widget_frame.cpp: background_behind), and a container with no background of
  // its own paints nothing, so the
  // screen is what shows through.
  const paintsContainer = background !== undefined && background !== 'transparent' && inset === 0
  const maskFill = paintsContainer ? background : behind
  // By default the caption straddles the top border: the device puts the label's
  // top half a line height above the box's edge and masks the border line behind
  // it. The anchor and the offsets move it from there, and the mask follows.
  const geometry = captionGeometry(
    placement,
    {
      alignment: configuration.title?.alignment ?? 'top_center',
      offsetX: configuration.title?.offset_x_px ?? 0,
      offsetY: configuration.title?.offset_y_px ?? 0,
      borderGap: configuration.title?.border_gap ?? true,
      pad: configuration.title?.gap_padding_px ?? 4
    },
    metrics,
    borderWidth
  )
  return (
    <g>
      {geometry.gap ? (
        <rect
          x={geometry.gap.x}
          y={geometry.gap.y}
          width={geometry.gap.width}
          height={geometry.gap.height}
          fill={maskFill}
        />
      ) : null}
      <text
        x={geometry.x}
        y={geometry.y + metrics.ascent}
        fill={configuration.title?.color ?? DEFAULT_TEXT_COLOR}
        fontFamily={font.family}
        fontSize={font.sizePx}
        fontWeight={font.weight}
      >
        {title}
      </text>
    </g>
  )
}

export function ShapePreview({
  configuration,
  values
}: {
  configuration: ShapeWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  // A shape has no content of its own, so a rule's value colour has nowhere to
  // land — exactly as on the device, where it binds no content-colour applier.
  const style = values.styleFor(configuration, {
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
  // An ellipse is a radius of half the shorter side, which is what the device
  // gets from LV_RADIUS_CIRCLE.
  const radius =
    configuration.kind === 'ellipse'
      ? Math.min(placement.width, placement.height) / 2
      : undefined
  return (
    <g>
      <WidgetFrameShape
        placement={placement}
        configuration={configuration}
        style={style}
        radius={radius}
      />
    </g>
  )
}
