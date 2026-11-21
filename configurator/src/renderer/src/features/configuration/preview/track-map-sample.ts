import {
  GRID_SIZE,
  LAP_UNITS,
  TRACK_MAP_ROLES,
  type TrackMapCar,
  type TrackOutline,
  type TrackPoint
} from '@shared/track-map-codec'

const LAYOUT: readonly TrackPoint[] = [
  [20, 90], [40, 90], [60, 90], [80, 90], [100, 90], [116, 90], [128, 89], [134, 82],
  [135, 72], [135, 62], [131, 54], [136, 46], [134, 36], [128, 26], [116, 20], [102, 18],
  [92, 18], [86, 23], [80, 23], [74, 18], [62, 18], [48, 18], [36, 22], [30, 32],
  [34, 44], [44, 52], [46, 60], [38, 66], [26, 68], [16, 74], [14, 84]
]

const FINISH_ON_STRAIGHT: TrackPoint = [72, 90]
const SMOOTHING_PASSES = 3
const TRACK_POINTS = 300
const GRID_SPACING = 24
const PIT_POINTS = 50
const PIT_FROM = 3808
const PIT_TO = 288
const PIT_OFFSET = 60
const PIT_RAMP = 0.3
const SECTOR_STARTS = [1472, 2880]
const CAR_UNITS = 2048

function at(points: readonly TrackPoint[], index: number): TrackPoint {
  return points[((index % points.length) + points.length) % points.length] ?? [0, 0]
}

function between([fromX, fromY]: TrackPoint, [toX, toY]: TrackPoint, share: number): TrackPoint {
  return [fromX + (toX - fromX) * share, fromY + (toY - fromY) * share]
}

function distance([fromX, fromY]: TrackPoint, [toX, toY]: TrackPoint): number {
  return Math.hypot(toX - fromX, toY - fromY)
}

function smoothed(points: readonly TrackPoint[]): TrackPoint[] {
  return points.flatMap((point, index) => {
    const next = at(points, index + 1)
    return [between(point, next, 0.25), between(point, next, 0.75)]
  })
}

function startingAt(points: readonly TrackPoint[], target: TrackPoint): TrackPoint[] {
  let start = 0
  points.forEach((point, index) => {
    if (distance(point, target) < distance(at(points, start), target)) start = index
  })
  return [...points.slice(start), ...points.slice(0, start)]
}

function resampled(points: readonly TrackPoint[], count: number): TrackPoint[] {
  const lengths = points.map((point, index) => distance(point, at(points, index + 1)))
  const perimeter = lengths.reduce((total, length) => total + length, 0)
  const result: TrackPoint[] = []
  let segment = 0
  let walked = 0
  for (let index = 0; index < count; index += 1) {
    const wanted = (perimeter * index) / count
    while (segment < lengths.length - 1 && walked + (lengths[segment] ?? 0) < wanted) {
      walked += lengths[segment] ?? 0
      segment += 1
    }
    const share = (wanted - walked) / Math.max(lengths[segment] ?? 1, 1e-9)
    result.push(between(at(points, segment), at(points, segment + 1), share))
  }
  return result
}

function onGrid(points: readonly TrackPoint[]): TrackPoint[] {
  const perimeter = points.reduce((total, point, index) => total + distance(point, at(points, index + 1)), 0)
  const scale = (GRID_SPACING * points.length) / perimeter
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2
  return points.map(([x, y]) => [
    Math.round(GRID_SIZE / 2 + (x - centerX) * scale),
    Math.round(GRID_SIZE / 2 + (y - centerY) * scale)
  ])
}

function pointAt(track: readonly TrackPoint[], units: number): TrackPoint {
  const position = ((units % LAP_UNITS) * track.length) / LAP_UNITS
  const index = Math.floor(position)
  return between(at(track, index), at(track, index + 1), position - index)
}

function ramp(share: number): number {
  const rise = Math.min(Math.max(Math.min(share, 1 - share) / PIT_RAMP, 0), 1)
  return rise * rise * (3 - 2 * rise)
}

function pitLane(track: readonly TrackPoint[]): TrackPoint[] {
  const span = (PIT_TO - PIT_FROM + LAP_UNITS) % LAP_UNITS
  return Array.from({ length: PIT_POINTS }, (_, index) => {
    const share = index / (PIT_POINTS - 1)
    const units = PIT_FROM + span * share
    const point = pointAt(track, units)
    const ahead = pointAt(track, units + 8)
    const length = Math.max(distance(point, ahead), 1e-9)
    const offset = PIT_OFFSET * ramp(share)
    return [
      Math.round(point[0] - ((ahead[1] - point[1]) / length) * offset),
      Math.round(point[1] + ((ahead[0] - point[0]) / length) * offset)
    ]
  })
}

function sampleOutline(): TrackOutline {
  let layout: TrackPoint[] = [...LAYOUT]
  for (let pass = 0; pass < SMOOTHING_PASSES; pass += 1) layout = smoothed(layout)
  const track = onGrid(resampled(startingAt(layout, FINISH_ON_STRAIGHT), TRACK_POINTS))
  return {
    id: 'AA',
    points: track,
    pit: { from: PIT_FROM / LAP_UNITS, to: PIT_TO / LAP_UNITS, points: pitLane(track) },
    finish: 0,
    sectors: SECTOR_STARTS.map((start) => start / LAP_UNITS)
  }
}

function car(fraction: number, role: number, cls: number, pit = false): TrackMapCar {
  return { fraction: Math.round(fraction * CAR_UNITS) / CAR_UNITS, pit, role, cls }
}

export const SAMPLE_TRACK_OUTLINE: TrackOutline = sampleOutline()

export const SAMPLE_TRACK_CARS: readonly TrackMapCar[] = [
  car(0.3, TRACK_MAP_ROLES.player, 1),
  car(0.345, TRACK_MAP_ROLES.ahead, 1),
  car(0.255, TRACK_MAP_ROLES.behind, 1),
  car(0.52, TRACK_MAP_ROLES.car, 1),
  car(0.66, TRACK_MAP_ROLES.car, 1),
  car(0.12, TRACK_MAP_ROLES.car, 2),
  car(0.6, TRACK_MAP_ROLES.car, 2),
  car(0.86, TRACK_MAP_ROLES.car, 2),
  car(0.44, TRACK_MAP_ROLES.lapping, 1),
  car(0.76, TRACK_MAP_ROLES.lapped, 2),
  car(0.19, TRACK_MAP_ROLES.lapped, 2),
  car(0.975, TRACK_MAP_ROLES.car, 2, true)
]
