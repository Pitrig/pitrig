import { useId } from 'react'
import { type ArcWidgetConfiguration, type BarWidgetConfiguration, type GraphWidgetConfiguration } from '@shared/configuration-schema'
import { rangeFraction } from '@shared/telemetry-value'
import { completePlacement } from '../dashboard-editor'
import { arcPath, needlePoints, ringGeometry } from './arc-geometry'
import { markupId } from './canvas-geometry'
import { DEFAULT_BORDER_COLOR } from './preview-theme'
import { type PreviewValues, normalizeColor } from './preview-values'
import { GradientDefinition, WidgetFrameShape } from './frame-shape'
import { contentArea, gradientPaint, squareFill } from './preview-geometry-paint'
import { deviceFloat } from '@shared/contract-number'

export function BarPreview({
  configuration,
  values
}: {
  configuration: BarWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const fillGradientId = markupId(useId())
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  const style = values.styleFor(configuration, {
    color: configuration.fill_color ?? '#38BDF8',
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
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
  const fillColor = style.color ?? '#38BDF8'
  const fillPaint = gradientPaint(fillGradientId, fillColor, configuration.fill_grad_color)

  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      {fillPaint.definition ? (
        <GradientDefinition
          id={fillGradientId}
          from={fillColor}
          to={configuration.fill_grad_color as string}
          direction={horizontal ? 'horizontal' : 'vertical'}
        />
      ) : null}
      {length > 0 ? (
        <rect
          x={horizontal ? inner.x + leading : inner.x}
          y={horizontal ? inner.y : inner.y + leading}
          width={horizontal ? length : inner.width}
          height={horizontal ? inner.height : length}
          rx={squareFill(configuration) ? 0 : Math.max(0, radius - borderWidth)}
          fill={fillPaint.paint}
        />
      ) : null}
    </g>
  )
}

export function ArcPreview({
  configuration,
  values
}: {
  configuration: ArcWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const clipId = markupId(useId())
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  const style = values.styleFor(configuration, {
    color: configuration.fill_color ?? '#38BDF8',
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
  const thickness = configuration.thickness_px ?? 8
  const start = configuration.start_angle_deg ?? 135
  const sweep = Math.min(configuration.sweep_deg ?? 270, 360)
  const plot = contentArea(placement, configuration.border?.width_px ?? 0, configuration.padding)
  const { radius, centerX, centerY } = ringGeometry(plot, thickness, configuration)
  const track = normalizeColor(configuration.track_color)
  const value = values.numberFor(configuration.source)
  const fraction = rangeFraction(value, configuration.minimum, configuration.maximum)
  const swept = value === undefined ? sweep : sweep * (configuration.inverted ? 1 - fraction : fraction)
  const faded = value === undefined ? (track && track !== 'transparent' ? 0.25 : 0.35) : 1
  const needle = (configuration.mark ?? 'ring') === 'needle'
  const pointer = needlePoints(centerX, centerY, radius, start + (needle ? swept : 0))

  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      <clipPath id={clipId}>
        <rect x={placement.x} y={placement.y} width={placement.width} height={placement.height} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {track && track !== 'transparent' ? (
          <path
            d={arcPath(centerX, centerY, radius, start, sweep)}
            fill="none"
            stroke={track}
            strokeWidth={thickness}
          />
        ) : null}
        {needle ? (
          <line
            {...pointer}
            stroke={style.color ?? '#38BDF8'}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeOpacity={faded}
          />
        ) : swept > 0 ? (
          <path
            d={arcPath(centerX, centerY, radius, start, swept)}
            fill="none"
            stroke={style.color ?? '#38BDF8'}
            strokeWidth={thickness}
            strokeOpacity={faded}
          />
        ) : null}
      </g>
    </g>
  )
}

export function GraphPreview({
  configuration,
  values
}: {
  configuration: GraphWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const placement = completePlacement(configuration.placement)
  if (!placement) return null
  const style = values.styleFor(configuration, {
    color: configuration.line_color ?? '#38BDF8',
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
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
  const ruled = style.color !== undefined && style.color !== (configuration.line_color ?? '#38BDF8')
  const traces = [
    configuration.line_color ?? '#38BDF8',
    ...(configuration.traces ?? []).map((trace) => trace?.line_color ?? '#38BDF8')
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
