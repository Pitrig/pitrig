import { useId } from 'react'
import { type GradientDirection } from '@shared/configuration-schema'
import { type ResolvedStyle } from '@shared/widget-style'
import { type Placement, markupId } from './canvas-geometry'
import { DEFAULT_BORDER_COLOR } from './preview-theme'
import type { FramedWidgetConfiguration } from '@shared/configuration-access'
import { backgroundRect, cornerRadii, gradientPaint, squareFill } from './preview-geometry-paint'
import { normalizeColor } from './preview-values'

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

export function TrackGradientDefinition({
  id,
  from,
  via,
  to,
  x1,
  y1,
  x2,
  y2
}: {
  id: string
  from: string
  via: string | undefined
  to: string
  x1: number
  y1: number
  x2: number
  y2: number
}): React.JSX.Element {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
      <stop offset="0%" stopColor={from} />
      {via !== undefined ? <stop offset="50%" stopColor={via} /> : null}
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
  radius?: number
}): React.JSX.Element {
  const gradientId = markupId(useId())
  const borderWidth = configuration.border?.width_px ?? 0
  const corner = radius ?? configuration.border?.radius_px ?? 0
  const fillCorner = squareFill(configuration) ? 0 : corner
  const background = normalizeColor(style.backgroundColor) ?? 'transparent'
  const box = backgroundRect(
    placement,
    borderWidth,
    fillCorner,
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
      {background !== 'transparent' ? (
        <rect {...box} {...cornerRadii(box.rx, box.width, box.height)} fill={fill.paint} />
      ) : null}
      {borderWidth > 0 ? (
        <rect
          x={placement.x + borderWidth / 2}
          y={placement.y + borderWidth / 2}
          width={placement.width - borderWidth}
          height={placement.height - borderWidth}
          {...cornerRadii(
            Math.max(0, corner - borderWidth / 2),
            placement.width - borderWidth,
            placement.height - borderWidth
          )}
          fill="none"
          stroke={style.borderColor ?? DEFAULT_BORDER_COLOR}
          strokeWidth={borderWidth}
        />
      ) : null}
    </>
  )
}
