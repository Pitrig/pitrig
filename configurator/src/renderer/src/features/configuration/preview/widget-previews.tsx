import { type ShapeWidgetConfiguration } from '@shared/configuration-schema'
import { useFontFaceStore } from '@/features/font-library/font-face-store'
import { completePlacement } from '../dashboard-editor'
import { WidgetFrameShape } from './frame-shape'
import { DEFAULT_BORDER_COLOR, DEFAULT_TEXT_COLOR } from './preview-theme'
import type { FramedWidgetConfiguration } from '@shared/configuration-access'
import { type PreviewValues, captionGeometry, fontMetrics, normalizeColor, resolvedFont } from './preview-values'

export function CaptionPreview({
  configuration,
  behind
}: {
  configuration: FramedWidgetConfiguration
  behind: string
}): React.JSX.Element | null {
  const loadedFamilies = useFontFaceStore((state) => state.loaded)
  const placement = completePlacement(configuration.placement)
  const title = configuration.title?.text
  if (!placement || !title) return null
  const font = resolvedFont(configuration.title?.font, 12, loadedFamilies)
  const metrics = fontMetrics(title, font)
  const borderWidth = configuration.border?.width_px ?? 0
  const background = normalizeColor(configuration.background_color)
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

export function ShapePreview({
  configuration,
  values
}: {
  configuration: ShapeWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  const style = values.styleFor(configuration, {
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
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
