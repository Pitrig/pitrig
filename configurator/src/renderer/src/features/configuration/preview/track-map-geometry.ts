import {
  LAP_UNITS,
  type TrackMapCar,
  type TrackOutline,
  type TrackPoint
} from '@shared/track-map-codec'

export interface MapPoint {
  x: number
  y: number
}

export interface MapProjection {
  track: readonly MapPoint[]
  pit: readonly MapPoint[]
  pitFrom: number
  pitTo: number
  finish: number
  sectorStarts: readonly number[]
}

export interface MapFit {
  width: number
  height: number
  margin: number
  rotationDeg: number
  fitRotation: boolean
}

interface Extent {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface Turn {
  cosine: number
  sine: number
}

const ANGLE_STEP_DEG = 5
const ANGLE_STEPS = 36
const FULL_TURN_DEG = 360
const RING_POINTS = 128
const TIE_TOLERANCE = 1e-5
const LAP_MASK = LAP_UNITS - 1
const PLAYER_RING_PX = 2
const FINISH_OVERHANG_PX = 8
const MINIMUM_FINISH_WIDTH_PX = 2
const MINIMUM_DIRECTION = 0.001

export function lapUnits(fraction: number): number {
  return Math.round(fraction * LAP_UNITS) & LAP_MASK
}

export function playerDiameter(playerSize: number, ringed: boolean): number {
  return ringed ? playerSize + PLAYER_RING_PX : playerSize
}

export function mapMargin(
  lineWidth: number,
  carSize: number,
  playerSize: number,
  ringed: boolean
): number {
  return Math.max(lineWidth, carSize, playerDiameter(playerSize, ringed)) / 2 + 1
}

function turnOf(degrees: number): Turn {
  const radians = ((degrees % FULL_TURN_DEG) * Math.PI) / 180
  return { cosine: Math.cos(radians), sine: Math.sin(radians) }
}

function turned([x, y]: TrackPoint, turn: Turn): MapPoint {
  return { x: x * turn.cosine - y * turn.sine, y: x * turn.sine + y * turn.cosine }
}

function extentAt(outline: TrackOutline, turn: Turn): Extent {
  const extent = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  const include = (point: TrackPoint): void => {
    const place = turned(point, turn)
    extent.minX = Math.min(extent.minX, place.x)
    extent.maxX = Math.max(extent.maxX, place.x)
    extent.minY = Math.min(extent.minY, place.y)
    extent.maxY = Math.max(extent.maxY, place.y)
  }
  outline.points.forEach(include)
  outline.pit?.points.forEach(include)
  return extent
}

function scaleOf(extent: Extent, width: number, height: number): number {
  const spanX = Math.max(extent.maxX - extent.minX, 1)
  const spanY = Math.max(extent.maxY - extent.minY, 1)
  return Math.min(width / spanX, height / spanY)
}

function bestAngle(outline: TrackOutline, fit: MapFit, width: number, height: number): number {
  let best = 0
  let bestScale = -1
  const steps = fit.fitRotation ? ANGLE_STEPS : 1
  for (let step = 0; step < steps; step += 1) {
    const degrees = step * ANGLE_STEP_DEG
    const scale = scaleOf(extentAt(outline, turnOf(degrees)), width, height)
    if (scale > bestScale * (1 + TIE_TOLERANCE)) {
      bestScale = scale
      best = degrees
    }
  }
  return best
}

function ringProjection(fit: MapFit, width: number, height: number): MapProjection {
  const radius = Math.min(width, height) / 2
  const track = Array.from({ length: RING_POINTS }, (_, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / RING_POINTS
    return {
      x: fit.width / 2 + radius * Math.cos(angle),
      y: fit.height / 2 + radius * Math.sin(angle)
    }
  })
  return { track, pit: [], pitFrom: 0, pitTo: 0, finish: 0, sectorStarts: [] }
}

export function projectOutline(outline: TrackOutline | undefined, fit: MapFit): MapProjection {
  const width = Math.max(fit.width - 2 * fit.margin, 1)
  const height = Math.max(fit.height - 2 * fit.margin, 1)
  if (!outline || outline.points.length < 3) return ringProjection(fit, width, height)
  const turn = turnOf(bestAngle(outline, fit, width, height) + fit.rotationDeg)
  const extent = extentAt(outline, turn)
  const scale = scaleOf(extent, width, height)
  const offsetX = fit.width / 2 - ((extent.minX + extent.maxX) / 2) * scale
  const offsetY = fit.height / 2 - ((extent.minY + extent.maxY) / 2) * scale
  const place = (point: TrackPoint): MapPoint => {
    const rotated = turned(point, turn)
    return { x: rotated.x * scale + offsetX, y: rotated.y * scale + offsetY }
  }
  return {
    track: outline.points.map(place),
    pit: (outline.pit?.points ?? []).map(place),
    pitFrom: lapUnits(outline.pit?.from ?? 0),
    pitTo: lapUnits(outline.pit?.to ?? 0),
    finish: lapUnits(outline.finish),
    sectorStarts: outline.sectors.map(lapUnits)
  }
}

function between(from: MapPoint, to: MapPoint, share: number): MapPoint {
  return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share }
}

export function onTrack(projection: MapProjection, units: number): MapPoint {
  const count = projection.track.length
  if (count === 0) return { x: 0, y: 0 }
  const position = ((units & LAP_MASK) * count) / LAP_UNITS
  const index = Math.floor(position)
  const from = projection.track[index % count] ?? { x: 0, y: 0 }
  const to = projection.track[(index + 1) % count] ?? from
  return between(from, to, position - index)
}

export function onPitLane(projection: MapProjection, units: number): MapPoint | undefined {
  const count = projection.pit.length
  if (count < 2) return undefined
  const span = (projection.pitTo - projection.pitFrom) & LAP_MASK
  const offset = (units - projection.pitFrom) & LAP_MASK
  if (span === 0 || offset > span) return undefined
  const position = (offset / span) * (count - 1)
  const index = Math.min(Math.floor(position), count - 2)
  const from = projection.pit[index]
  const to = projection.pit[index + 1]
  return from && to ? between(from, to, position - index) : undefined
}

export function sectorOf(projection: MapProjection, units: number): number {
  const relative = (units - projection.finish) & LAP_MASK
  let sector = 0
  for (const start of projection.sectorStarts) {
    if (((start - projection.finish) & LAP_MASK) <= relative) sector += 1
  }
  return sector
}

export interface TrackRun {
  color: string
  points: MapPoint[]
}

export function trackRuns(
  projection: MapProjection,
  colorOf: (sector: number) => string
): TrackRun[] {
  const count = projection.track.length
  const runs: TrackRun[] = []
  for (let index = 0; index < count; index += 1) {
    const color = colorOf(sectorOf(projection, Math.floor((index * LAP_UNITS) / count)))
    const from = projection.track[index]
    const to = projection.track[(index + 1) % count]
    if (!from || !to) continue
    const last = runs[runs.length - 1]
    if (last?.color === color) last.points.push(to)
    else runs.push({ color, points: [from, to] })
  }
  return runs
}

export function carPoint(
  projection: MapProjection,
  car: TrackMapCar,
  pitLaneDrawn: boolean
): MapPoint {
  const units = lapUnits(car.fraction)
  const lane = car.pit && pitLaneDrawn ? onPitLane(projection, units) : undefined
  return lane ?? onTrack(projection, units)
}

export function finishMark(
  projection: MapProjection,
  lineWidth: number
): { from: MapPoint; to: MapPoint; width: number } | undefined {
  const count = projection.track.length
  if (count === 0) return undefined
  const step = Math.floor(LAP_UNITS / count) + 1
  const center = onTrack(projection, projection.finish)
  const before = onTrack(projection, projection.finish - step)
  const after = onTrack(projection, projection.finish + step)
  const alongX = after.x - before.x
  const alongY = after.y - before.y
  const length = Math.hypot(alongX, alongY)
  if (length < MINIMUM_DIRECTION) return undefined
  const half = (2 * lineWidth + FINISH_OVERHANG_PX) / 2
  const acrossX = (-alongY / length) * half
  const acrossY = (alongX / length) * half
  return {
    from: { x: center.x - acrossX, y: center.y - acrossY },
    to: { x: center.x + acrossX, y: center.y + acrossY },
    width: Math.max(Math.floor(lineWidth / 2), MINIMUM_FINISH_WIDTH_PX)
  }
}

export function dotCenter(value: number, diameter: number): number {
  return Math.round(value) - Math.floor(diameter / 2) + diameter / 2
}
