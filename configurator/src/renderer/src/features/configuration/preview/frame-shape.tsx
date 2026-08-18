import { useId } from 'react'
import { type GradientDirection } from '@shared/configuration-schema'
import { type ResolvedStyle } from '@shared/widget-style'
import { type Placement, markupId } from './canvas-geometry'
import { DEFAULT_BORDER_COLOR, type FramedWidgetConfiguration } from './preview-theme'
import { backgroundRect, gradientPaint } from './preview-geometry-paint'
import { normalizeColor } from './preview-values'

// The box every widget preview draws around itself: the background, its
// gradient, the border and the inset. Shared because it is the frame the
// firmware draws too, not because these previews happen to look alike.

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
