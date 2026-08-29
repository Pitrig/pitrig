import { type TextWidgetConfiguration } from '@shared/configuration-schema'
import { composeWidgetText, placeholderBody, transformedBody, withAffixes } from '@shared/value-format'
import { useFontFaceStore } from '@/features/font-library/font-face-store'
import { completePlacement } from '../dashboard-editor'
import { DEFAULT_BORDER_COLOR, DEFAULT_TEXT_COLOR } from './preview-theme'
import { contentArea } from './preview-geometry-paint'
import { type PreviewValues, alignmentAnchor, centerOffset, fontMetrics, resolvedFont } from './preview-values'
import { WidgetFrameShape } from './frame-shape'

export function TextWidgetPreview({
  configuration,
  values
}: {
  configuration: TextWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const loadedFamilies = useFontFaceStore((state) => state.loaded)
  const placement = completePlacement(configuration.placement)
  if (!placement) return null

  const borderWidth = configuration.border?.width_px ?? 0
  const title = configuration.title?.text ?? ''
  const titleFont = resolvedFont(configuration.title?.font, 10, loadedFamilies)
  const valueFont = resolvedFont(configuration.value?.font, 48, loadedFamilies)
  const content = contentArea(placement, borderWidth, configuration.padding)
  const style = values.styleFor(configuration, {
    color: configuration.value?.color ?? DEFAULT_TEXT_COLOR,
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
  const previewValue = composedText(configuration, values)

  const metrics = fontMetrics(previewValue, valueFont)
  const { column, row } = alignmentAnchor(configuration.value?.alignment ?? 'center')
  const valueX =
    column === 'left'
      ? content.x
      : column === 'right'
        ? content.x + content.width - metrics.width
        : content.x + centerOffset(content.width, metrics.width)
  const titleDrop = title ? Math.trunc(fontMetrics(title, titleFont).lineHeight / 4) : 0
  const valueY =
    row === 'top'
      ? content.y
      : row === 'bottom'
        ? content.y + content.height - metrics.lineHeight
        : content.y + centerOffset(content.height, metrics.lineHeight)
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
  return composeWidgetText(parts)
}
