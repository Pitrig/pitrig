import { useId } from 'react'
import { type IndicatorWidgetConfiguration } from '@shared/configuration-schema'
import { deviceFloat } from '@shared/contract-number'
import { rangeFraction } from '@shared/telemetry-value'
import { completePlacement } from '../dashboard-editor'
import { arcPath, arcSlices, ringGeometry } from './arc-geometry'
import { WidgetFrameShape } from './frame-shape'
import { markupId } from './canvas-geometry'
import { contentArea } from './preview-geometry-paint'
import { DEFAULT_BORDER_COLOR } from './preview-theme'
import { type PreviewValues, normalizeColor } from './preview-values'

export function IndicatorPreview({
  configuration,
  values
}: {
  configuration: IndicatorWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const clipId = markupId(useId())
  const placement = completePlacement(configuration.placement)
  const segments = configuration.segments ?? []
  if (!placement || segments.length === 0) return null
  const style = values.styleFor(configuration, {
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
  const strip = contentArea(placement, configuration.border?.width_px ?? 0, configuration.padding)
  const gap = configuration.segment_gap_px ?? 4
  const off = normalizeColor(configuration.off_color)
  const unlitPainted = off !== undefined && off !== 'transparent'
  const value = values.numberFor(configuration.source)
  const fraction = rangeFraction(value, configuration.minimum, configuration.maximum)
  const inverted = configuration.inverted ?? false
  const slotOf = (index: number): number => (inverted ? segments.length - 1 - index : index)
  const lampColor = (index: number): string | undefined => {
    const lit = value !== undefined && fraction >= deviceFloat(segments[index]?.threshold ?? 0)
    if (lit) return segments[index]?.color ?? '#00C853'
    return unlitPainted ? (off as string) : undefined
  }

  if ((configuration.shape ?? 'strip') === 'arc') {
    const thickness = configuration.thickness_px ?? 8
    const { radius, centerX, centerY } = ringGeometry(strip, thickness, configuration)
    const slices = arcSlices(
      segments.length,
      configuration.center_angle_deg ?? 270,
      Math.min(configuration.sector_deg ?? 270, 360),
      gap,
      radius
    )
    return (
      <g>
        <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
        <clipPath id={clipId}>
          <rect x={placement.x} y={placement.y} width={placement.width} height={placement.height} />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>
          {segments.map((_, index) => {
            const slice = slices[slotOf(index)]
            const color = lampColor(index)
            if (!slice || !color) return null
            return (
              <path
                key={index}
                d={arcPath(centerX, centerY, radius, slice.start, slice.sweep)}
                fill="none"
                stroke={color}
                strokeWidth={thickness}
                strokeLinecap={(configuration.segment_radius_px ?? 0) > 0 ? 'round' : 'butt'}
              />
            )
          })}
        </g>
      </g>
    )
  }

  const horizontal = (configuration.orientation ?? 'horizontal') === 'horizontal'
  const span = horizontal ? strip.width : strip.height
  const length = Math.floor((span - gap * (segments.length - 1)) / segments.length)
  if (length <= 0) return null

  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      {segments.map((_, index) => {
        const color = lampColor(index)
        if (!color) return null
        const offset = slotOf(index) * (length + gap)
        return (
          <rect
            key={index}
            x={horizontal ? strip.x + offset : strip.x}
            y={horizontal ? strip.y : strip.y + strip.height - offset - length}
            width={horizontal ? length : strip.width}
            height={horizontal ? strip.height : length}
            rx={configuration.segment_radius_px ?? 0}
            fill={color}
          />
        )
      })}
    </g>
  )
}
