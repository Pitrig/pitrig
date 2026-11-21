import { useId, useMemo } from 'react'
import { type TrackMapWidgetConfiguration } from '@shared/configuration-schema'
import { TRACK_MAP_ROLES, type TrackMapCar } from '@shared/track-map-codec'
import { completePlacement } from '../dashboard-editor'
import { type Placement, markupId } from './canvas-geometry'
import { WidgetFrameShape } from './frame-shape'
import { contentArea, cornerReserve, paintedColor } from './preview-geometry-paint'
import type { PreviewStyle, PreviewValues } from './preview-values'
import { type MapPoint, type MapProjection, type TrackMark, carPoint, dotCenter, finishWidth, mapMargin, pitLaneWidth, projectOutline, sectorMarkWidth, trackMark } from './track-map-geometry'
import { trackMapData } from './track-map-live'
import { type TrackMapLook, carPaint, trackColor, trackMapLook } from './track-map-look'

const MINIMUM_MAP_SIDE_PX = 16

function canvasArea(placement: Placement, configuration: TrackMapWidgetConfiguration): Placement {
  const border = configuration.border?.width_px ?? 0
  const reserve = cornerReserve(configuration.border?.radius_px ?? 0, border)
  const content = contentArea(placement, border, configuration.padding)
  return {
    x: content.x + reserve,
    y: content.y + reserve,
    width: Math.max(0, content.width - 2 * reserve),
    height: Math.max(0, content.height - 2 * reserve)
  }
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100
}

function pointList(points: readonly MapPoint[]): string {
  return points.map(({ x, y }) => `${rounded(x)},${rounded(y)}`).join(' ')
}

function MarkLine({ mark, color }: { mark: TrackMark; color: string }): React.JSX.Element {
  return (
    <line
      x1={rounded(mark.from.x)}
      y1={rounded(mark.from.y)}
      x2={rounded(mark.to.x)}
      y2={rounded(mark.to.y)}
      stroke={color}
      strokeWidth={mark.width}
    />
  )
}

function TrackLines({
  projection,
  look,
  override
}: {
  projection: MapProjection
  look: TrackMapLook
  override: string | undefined
}): React.JSX.Element {
  const first = projection.track[0]
  const loop = first ? [...projection.track, first] : []
  const sectorMarks =
    look.sectorMark === undefined
      ? []
      : projection.sectorStarts.flatMap((start) => {
          const mark = trackMark(projection, start, look.lineWidth, sectorMarkWidth(look.lineWidth))
          return mark ? [mark] : []
        })
  const finish =
    look.finish === undefined
      ? undefined
      : trackMark(projection, projection.finish, look.lineWidth, finishWidth(look.lineWidth))
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {look.pitLane !== undefined && projection.pit.length >= 2 ? (
        <polyline points={pointList(projection.pit)} stroke={look.pitLane} strokeWidth={pitLaneWidth(look.lineWidth)} />
      ) : null}
      <polyline points={pointList(loop)} stroke={trackColor(look, override)} strokeWidth={look.lineWidth} />
      {look.sectorMark !== undefined
        ? sectorMarks.map((mark, index) => <MarkLine key={index} mark={mark} color={look.sectorMark ?? ''} />)
        : null}
      {finish && look.finish !== undefined ? <MarkLine mark={finish} color={look.finish} /> : null}
    </g>
  )
}

function Dot({
  at,
  diameter,
  color,
  outline,
  opacity = 1
}: {
  at: MapPoint
  diameter: number
  color: string
  outline: string
  opacity?: number
}): React.JSX.Element {
  const cx = dotCenter(at.x, diameter)
  const cy = dotCenter(at.y, diameter)
  const fade = opacity < 1 ? opacity : undefined
  return (
    <>
      <circle cx={cx} cy={cy} r={diameter / 2 + 1} fill={outline} fillOpacity={fade} />
      <circle cx={cx} cy={cy} r={diameter / 2} fill={color} fillOpacity={fade} />
    </>
  )
}

function CarDots({
  projection,
  look,
  cars,
  background
}: {
  projection: MapProjection
  look: TrackMapLook
  cars: readonly TrackMapCar[]
  background: string
}): React.JSX.Element {
  const laneDrawn = look.pitLane !== undefined
  const player = cars.filter((car) => car.role === TRACK_MAP_ROLES.player).at(-1)
  return (
    <g>
      {cars.map((car, index) => {
        if (car.role === TRACK_MAP_ROLES.player) return null
        const paint = carPaint(look, car)
        return (
          <Dot
            key={index}
            at={carPoint(projection, car, laneDrawn)}
            diameter={look.carSize}
            color={paint.color}
            outline={background}
            opacity={paint.opacity}
          />
        )
      })}
      {player ? (
        <Dot
          at={carPoint(projection, player, laneDrawn)}
          diameter={look.playerSize}
          color={look.player}
          outline={look.playerRing ?? background}
        />
      ) : null}
    </g>
  )
}

export function TrackMapPreview({
  configuration,
  values,
  style,
  behind
}: {
  configuration: TrackMapWidgetConfiguration
  values: PreviewValues
  style: PreviewStyle
  behind: string
}): React.JSX.Element | null {
  const clipId = markupId(useId())
  const { outline, cars } = trackMapData(values)
  const look = trackMapLook(configuration)
  const placement = completePlacement(configuration.placement)
  const inner = placement ? canvasArea(placement, configuration) : undefined
  const width = inner?.width ?? 0
  const height = inner?.height ?? 0
  const margin = mapMargin(look.lineWidth, look.carSize, look.playerSize)
  const { rotationDeg, fitRotation } = look
  const projection = useMemo(
    () => projectOutline(outline, { width, height, margin, rotationDeg, fitRotation }),
    [outline, width, height, margin, rotationDeg, fitRotation]
  )
  if (!placement || !inner) return null
  const drawsMap = inner.width >= MINIMUM_MAP_SIDE_PX && inner.height >= MINIMUM_MAP_SIDE_PX
  const background = paintedColor(configuration.background_color) ?? behind
  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      {drawsMap && (
        <>
          <clipPath id={clipId}>
            <rect x={inner.x} y={inner.y} width={inner.width} height={inner.height} />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>
            <rect x={inner.x} y={inner.y} width={inner.width} height={inner.height} fill={background} />
            <g transform={`translate(${inner.x} ${inner.y})`}>
              <TrackLines projection={projection} look={look} override={paintedColor(style.color)} />
              <CarDots projection={projection} look={look} cars={cars} background={background} />
            </g>
          </g>
        </>
      )}
    </g>
  )
}
