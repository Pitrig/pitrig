import { useId } from 'react'
import { type ArcWidgetConfiguration, type BarWidgetConfiguration, type GraphWidgetConfiguration, type RgbColor } from '@shared/configuration-schema'
import { rangeFraction } from '@shared/telemetry-value'
import { completePlacement } from '../dashboard-editor'
import { arcPath, needlePoints, ringGeometry, sectorStart } from './arc-geometry'
import { markupId } from './canvas-geometry'
import { DEFAULT_FILL_COLOR } from './preview-theme'
import { type PreviewStyle, type PreviewValues, normalizeColor } from './preview-values'
import { TrackGradientDefinition, WidgetFrameShape } from './frame-shape'
import { contentArea, cornerRadii, gradientPaint, paintedColor, squareFill } from './preview-geometry-paint'
import { deviceFloat } from '@shared/contract-number'
import { gradientArcSegments } from './arc-gradient'

export function BarPreview({
  configuration,
  values,
  style
}: {
  configuration: BarWidgetConfiguration
  values: PreviewValues
  style: PreviewStyle
}): React.JSX.Element | null {
  const fillGradientId = markupId(useId())
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  const borderWidth = configuration.border?.width_px ?? 0
  const radius = configuration.border?.radius_px ?? 0

  const inner = contentArea(placement, borderWidth, configuration.padding)
  const horizontal = (configuration.orientation ?? 'horizontal') === 'horizontal'
  const span = horizontal ? inner.width : inner.height
  const fraction = rangeFraction(values.numberFor(configuration.source), configuration.minimum, configuration.maximum)
  const originFraction = configuration.origin === undefined
    ? 0
    : rangeFraction(deviceFloat(configuration.origin), configuration.minimum, configuration.maximum)
  const offset = Math.round(span * Math.min(originFraction, fraction))
  const length = Math.round(span * Math.max(originFraction, fraction)) - offset
  const fromAxisStart = horizontal !== (configuration.inverted ?? false)
  const leading = fromAxisStart ? offset : span - offset - length
  const fillColor = style.color ?? DEFAULT_FILL_COLOR
  const fillPaint = gradientPaint(fillGradientId, fillColor, configuration.fill_grad_color)
  const fillRect = {
    x: horizontal ? inner.x + leading : inner.x,
    y: horizontal ? inner.y : inner.y + leading,
    width: horizontal ? length : inner.width,
    height: horizontal ? inner.height : length
  }
  const fillCorner = squareFill(configuration) ? 0 : Math.max(0, radius - borderWidth)
  const minimumEnd = fromAxisStart ? { x: inner.x, y: inner.y } : { x: inner.x + inner.width, y: inner.y + inner.height }
  const maximumEnd = fromAxisStart ? { x: inner.x + inner.width, y: inner.y + inner.height } : { x: inner.x, y: inner.y }

  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      {fillPaint.definition ? (
        <TrackGradientDefinition
          id={fillGradientId}
          from={fillColor}
          via={paintedColor(configuration.fill_grad_mid_color)}
          to={configuration.fill_grad_color as string}
          x1={horizontal ? minimumEnd.x : inner.x}
          y1={horizontal ? inner.y : minimumEnd.y}
          x2={horizontal ? maximumEnd.x : inner.x}
          y2={horizontal ? inner.y : maximumEnd.y}
        />
      ) : null}
      {length > 0 ? (
        <rect
          {...fillRect}
          {...cornerRadii(fillCorner, fillRect.width, fillRect.height)}
          fill={fillPaint.paint}
        />
      ) : null}
    </g>
  )
}

export function ArcPreview({
  configuration,
  values,
  style
}: {
  configuration: ArcWidgetConfiguration
  values: PreviewValues
  style: PreviewStyle
}): React.JSX.Element | null {
  const clipId = markupId(useId())
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  const thickness = configuration.thickness_px ?? 8
  const sector = Math.min(configuration.sector_deg ?? 270, 360)
  const start = sectorStart(configuration.center_angle_deg ?? 270, sector)
  const plot = contentArea(placement, configuration.border?.width_px ?? 0, configuration.padding)
  const { radius, centerX, centerY } = ringGeometry(plot, thickness, configuration)
  const track = normalizeColor(configuration.track_color)
  const value = values.numberFor(configuration.source)
  const inverted = configuration.inverted ?? false
  const fraction = rangeFraction(value, configuration.minimum, configuration.maximum)
  const swept = sector * fraction
  const fillStart = inverted ? start + sector - swept : start
  const needle = (configuration.mark ?? 'ring') === 'needle'
  const pointer = needlePoints(centerX, centerY, radius, inverted ? fillStart : start + swept)
  const authoredFill = configuration.fill_color ?? DEFAULT_FILL_COLOR
  const fillColor = style.color ?? authoredFill
  const rampEnd = paintedColor(configuration.fill_grad_color)
  const gradient = !needle && rampEnd !== undefined && fillColor === authoredFill

  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      <clipPath id={clipId}>
        <rect x={placement.x} y={placement.y} width={placement.width} height={placement.height} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {track && track !== 'transparent' ? (
          <path
            d={arcPath(centerX, centerY, radius, start, sector)}
            fill="none"
            stroke={track}
            strokeWidth={thickness}
          />
        ) : null}
        {needle ? (
          <line
            {...pointer}
            stroke={fillColor}
            strokeWidth={thickness}
            strokeLinecap="round"
          />
        ) : swept > 0 && gradient ? (
          <g fill="none" strokeWidth={thickness}>
            {gradientArcSegments({ centerX, centerY, radius, sectorStart: start, sectorDegrees: sector, fillStart, sweptDegrees: swept, inverted, from: authoredFill, via: paintedColor(configuration.fill_grad_mid_color) as RgbColor | undefined, to: rampEnd as RgbColor }).map((segment, index) => (
              <path key={index} d={segment.d} stroke={segment.color} />
            ))}
          </g>
        ) : swept > 0 ? (
          <path
            d={arcPath(centerX, centerY, radius, fillStart, swept)}
            fill="none"
            stroke={fillColor}
            strokeWidth={thickness}
          />
        ) : null}
      </g>
    </g>
  )
}

export function GraphPreview({
  configuration,
  style
}: {
  configuration: GraphWidgetConfiguration
  style: PreviewStyle
}): React.JSX.Element | null {
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  const width = configuration.line_width_px ?? 2
  const border = configuration.border?.width_px ?? 0
  const innerRadius = Math.max(0, (configuration.border?.radius_px ?? 0) - border)
  const reserve = Math.ceil(width / 2) + Math.ceil((innerRadius * 2929) / 10000)
  const content = contentArea(placement, border, configuration.padding)
  const plot = {
    x: content.x + reserve,
    y: content.y + reserve,
    width: Math.max(0, content.width - 2 * reserve),
    height: Math.max(0, content.height - 2 * reserve)
  }
  const ruled =
    style.color !== undefined && style.color !== (configuration.line_color ?? DEFAULT_FILL_COLOR)
  const traces = [
    configuration.line_color ?? DEFAULT_FILL_COLOR,
    ...(configuration.traces ?? []).map((trace) => trace?.line_color ?? DEFAULT_FILL_COLOR)
  ]

  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      {traces.map((color, index) => {
        const y = plot.y + (plot.height * (index + 1)) / (traces.length + 1)
        return (
          <line
            key={index}
            x1={plot.x}
            y1={y}
            x2={plot.x + plot.width}
            y2={y}
            stroke={ruled ? style.color : color}
            strokeWidth={width}
            strokeOpacity={0.35}
          />
        )
      })}
    </g>
  )
}
