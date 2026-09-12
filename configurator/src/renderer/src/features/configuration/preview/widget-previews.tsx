import { type ShapeWidgetConfiguration } from '@shared/configuration-schema'
import { transformedBody } from '@shared/value-format'
import { useFontFaceStore } from '@/features/font-library/font-face-store'
import { completePlacement } from '../dashboard-editor'
import { WidgetFrameShape } from './frame-shape'
import { DEFAULT_TEXT_COLOR } from './preview-theme'
import type { FramedWidgetConfiguration } from '@shared/configuration-access'
import { DEFAULT_CAPTION_FONT_SIZE_PX, type PreviewStyle, type PreviewValues, captionGeometry, fontMetrics, normalizeColor, resolvedFont } from './preview-values'

export function CaptionPreview({
  configuration,
  values,
  style,
  behind
}: {
  configuration: FramedWidgetConfiguration
  values: PreviewValues
  style: PreviewStyle
  behind: string
}): React.JSX.Element | null {
  const loadedFamilies = useFontFaceStore((state) => state.loaded)
  const placement = completePlacement(configuration.placement)
  const authored = configuration.title?.text
  if (!placement || !authored) return null
  const title = captionText(configuration, authored, values)
  const font = resolvedFont(configuration.title?.font, DEFAULT_CAPTION_FONT_SIZE_PX, loadedFamilies)
  const metrics = fontMetrics(title, font)
  const borderWidth = configuration.border?.width_px ?? 0
  const background = normalizeColor(style.backgroundColor)
  const inset = configuration.background_inset_px ?? 0
  const paintsContainer = background !== undefined && background !== 'transparent' && inset === 0
  const maskFill = paintsContainer ? background : behind
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

function captionText(
  configuration: FramedWidgetConfiguration,
  authored: string,
  values: PreviewValues
): string {
  const binding = configuration.title?.source?.binding
  if (binding === undefined) return authored
  const body = transformedBody(undefined, values.read(binding))
  return body === undefined || body.length === 0 ? authored : body
}

export function ShapePreview({
  configuration,
  style
}: {
  configuration: ShapeWidgetConfiguration
  style: PreviewStyle
}): React.JSX.Element | null {
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
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
