import { useId, useMemo } from 'react'
import { type TrackMapWidgetConfiguration } from '@shared/configuration-schema'
import { TRACK_MAP_ROLES, type TrackMapCar } from '@shared/track-map-codec'
import { completePlacement } from '../dashboard-editor'
import { type Placement, markupId } from './canvas-geometry'
import { WidgetFrameShape } from './frame-shape'
import { contentArea, cornerReserve, paintedColor } from './preview-geometry-paint'
import type { PreviewStyle, PreviewValues } from './preview-values'
import { type MapPoint, type MapProjection, carPoint, dotCenter, finishMark, mapMargin, playerDiameter, projectOutline, trackRuns } from './track-map-geometry'
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

function TrackLines({
  projection,
  look,
  override
}: {
  projection: MapProjection
  look: TrackMapLook
  override: string | undefined
}): React.JSX.Element {
  const sectored = projection.sectorStarts.length > 0
  const runs = trackRuns(projection, (sector) => trackColor(look, sectored, sector, override))
  const finish = look.finish === undefined ? undefined : finishMark(projection, look.lineWidth)
  const laneWidth = Math.max(Math.floor(look.lineWidth / 2), 1)
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {look.pitLane !== undefined && projection.pit.length >= 2 ? (
        <polyline points={pointList(projection.pit)} stroke={look.pitLane} strokeWidth={laneWidth} />
      ) : null}
      {runs.map((run, index) => (
        <polyline key={index} points={pointList(run.points)} stroke={run.color} strokeWidth={look.lineWidth} />
      ))}
      {finish ? (
        <line
          x1={rounded(finish.from.x)}
          y1={rounded(finish.from.y)}
          x2={rounded(finish.to.x)}
          y2={rounded(finish.to.y)}
          stroke={look.finish}
          strokeWidth={finish.width}
        />
      ) : null}
    </g>
  )
}

function Dot({
  at,
  diameter,
  color,
  opacity = 1,
  ring
}: {
  at: MapPoint
  diameter: number
  color: string
  opacity?: number
  ring?: string
}): React.JSX.Element {
  const cx = dotCenter(at.x, diameter)
  const cy = dotCenter(at.y, diameter)
  return (
    <>
      <circle cx={cx} cy={cy} r={diameter / 2} fill={color} fillOpacity={opacity < 1 ? opacity : undefined} />
      {ring !== undefined ? (
        <circle cx={cx} cy={cy} r={diameter / 2 - 0.5} fill="none" stroke={ring} strokeWidth={1} />
      ) : null}
    </>
  )
}

function CarDots({
  projection,
  look,
  cars
}: {
  projection: MapProjection
  look: TrackMapLook
  cars: readonly TrackMapCar[]
}): React.JSX.Element {
  const laneDrawn = look.pitLane !== undefined
  const player = cars.filter((car) => car.role === TRACK_MAP_ROLES.player).at(-1)
  return (
    <g>
      {cars.map((car, index) => {
        if (car.role === TRACK_MAP_ROLES.player) return null
        const paint = carPaint(look, car)
        return <Dot key={index} at={carPoint(projection, car, laneDrawn)} diameter={look.carSize} color={paint.color} opacity={paint.opacity} />
      })}
      {player ? (
        <Dot
          at={carPoint(projection, player, laneDrawn)}
          diameter={playerDiameter(look.playerSize, look.playerRing !== undefined)}
          color={look.player}
          ring={look.playerRing}
        />
      ) : null}
    </g>
  )
}

export function TrackMapPreview({
  configuration,
  values,
  style
}: {
  configuration: TrackMapWidgetConfiguration
  values: PreviewValues
  style: PreviewStyle
}): React.JSX.Element | null {
  const clipId = markupId(useId())
  const { outline, cars } = trackMapData(values)
  const look = trackMapLook(configuration)
  const placement = completePlacement(configuration.placement)
  const inner = placement ? canvasArea(placement, configuration) : undefined
  const width = inner?.width ?? 0
  const height = inner?.height ?? 0
  const margin = mapMargin(look.lineWidth, look.carSize, look.playerSize, look.playerRing !== undefined)
  const { rotationDeg, fitRotation } = look
  const projection = useMemo(
    () => projectOutline(outline, { width, height, margin, rotationDeg, fitRotation }),
    [outline, width, height, margin, rotationDeg, fitRotation]
  )
  if (!placement || !inner) return null
  const drawsMap = inner.width >= MINIMUM_MAP_SIDE_PX && inner.height >= MINIMUM_MAP_SIDE_PX
  return (
    <g>
      <WidgetFrameShape placement={placement} configuration={configuration} style={style} />
      {drawsMap && (
        <>
      <clipPath id={clipId}>
        <rect x={inner.x} y={inner.y} width={inner.width} height={inner.height} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <g transform={`translate(${inner.x} ${inner.y})`}>
          <TrackLines projection={projection} look={look} override={paintedColor(style.color)} />
          <CarDots projection={projection} look={look} cars={cars} />
        </g>
      </g>
        </>
      )}
    </g>
  )
}
