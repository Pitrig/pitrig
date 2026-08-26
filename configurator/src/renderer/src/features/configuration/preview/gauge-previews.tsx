import { useId } from 'react'
import { type ArcWidgetConfiguration, type BarWidgetConfiguration, type GraphWidgetConfiguration, type IndicatorWidgetConfiguration } from '@shared/configuration-schema'
import { rangeFraction } from '@shared/telemetry-value'
import { completePlacement } from '../dashboard-editor'
import { markupId } from './canvas-geometry'
import { DEFAULT_BORDER_COLOR } from './preview-theme'
import { type PreviewValues, normalizeColor } from './preview-values'
import { GradientDefinition, WidgetFrameShape } from './frame-shape'
import { contentArea, gradientPaint } from './preview-geometry-paint'
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
          rx={Math.max(0, radius - borderWidth)}
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
  const radius = Math.max(0, Math.min(plot.width, plot.height) / 2 - thickness / 2)
  const centerX = plot.x + plot.width / 2
  const centerY = plot.y + plot.height / 2
  const track = normalizeColor(configuration.track_color)
  const value = values.numberFor(configuration.source)
  const fraction = rangeFraction(value, configuration.minimum, configuration.maximum)
  const swept = value === undefined ? sweep : sweep * (configuration.inverted ? 1 - fraction : fraction)

  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      {track && track !== 'transparent' ? (
        <path
          d={arcPath(centerX, centerY, radius, start, sweep)}
          fill="none"
          stroke={track}
          strokeWidth={thickness}
        />
      ) : null}
      {swept > 0 ? (
        <path
          d={arcPath(centerX, centerY, radius, start, swept)}
          fill="none"
          stroke={style.color ?? '#38BDF8'}
          strokeWidth={thickness}
          strokeOpacity={value === undefined ? (track && track !== 'transparent' ? 0.25 : 0.35) : 1}
        />
      ) : null}
    </g>
  )
}

function arcPath(
  centerX: number,
  centerY: number,
  radius: number,
  startDegrees: number,
  sweepDegrees: number
): string {
  const point = (degrees: number): [number, number] => {
    const radians = (degrees * Math.PI) / 180
    return [centerX + radius * Math.cos(radians), centerY + radius * Math.sin(radians)]
  }
  if (sweepDegrees >= 360) {
    const [x, y] = point(startDegrees)
    const [oppositeX, oppositeY] = point(startDegrees + 180)
    return `M ${x} ${y} A ${radius} ${radius} 0 1 1 ${oppositeX} ${oppositeY} A ${radius} ${radius} 0 1 1 ${x} ${y}`
  }
  const [startX, startY] = point(startDegrees)
  const [endX, endY] = point(startDegrees + sweepDegrees)
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${sweepDegrees > 180 ? 1 : 0} 1 ${endX} ${endY}`
}

export function IndicatorPreview({
  configuration,
  values
}: {
  configuration: IndicatorWidgetConfiguration
  values: PreviewValues
}): React.JSX.Element | null {
  const placement = completePlacement(configuration.placement)
  const segments = configuration.segments ?? []
  if (!placement || segments.length === 0) return null
  const style = values.styleFor(configuration, {
    backgroundColor: configuration.background_color,
    borderColor: configuration.border?.color ?? DEFAULT_BORDER_COLOR
  })
  if (!style.visible) return null
  const horizontal = (configuration.orientation ?? 'horizontal') === 'horizontal'
  const gap = configuration.segment_gap_px ?? 4
  const strip = contentArea(placement, configuration.border?.width_px ?? 0, configuration.padding)
  const span = horizontal ? strip.width : strip.height
  const length = Math.floor((span - gap * (segments.length - 1)) / segments.length)
  if (length <= 0) return null
  const off = normalizeColor(configuration.off_color)
  const value = values.numberFor(configuration.source)
  const fraction = rangeFraction(value, configuration.minimum, configuration.maximum)
  const unlitPainted = off !== undefined && off !== 'transparent'

  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      {segments.map((segment, index) => {
        const offset = index * (length + gap)
        const lit = value !== undefined && fraction >= deviceFloat(segment.threshold ?? 0)
        if (!lit && !unlitPainted) return null
        return (
          <rect
            key={index}
            x={horizontal ? strip.x + offset : strip.x}
            y={horizontal ? strip.y : strip.y + strip.height - offset - length}
            width={horizontal ? length : strip.width}
            height={horizontal ? strip.height : length}
            rx={configuration.segment_radius_px ?? 0}
            fill={lit ? (segment.color ?? '#00C853') : (off as string)}
          />
        )
      })}
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
