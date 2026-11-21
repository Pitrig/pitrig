import type { RgbColor, TrackMapWidgetConfiguration } from '@shared/configuration-schema'
import { TRACK_MAP_ROLES, type TrackMapCar } from '@shared/track-map-codec'
import { paintedColor } from './preview-geometry-paint'

export const TRACK_MAP_DEFAULTS = {
  lineColor: '#C9D1D9',
  lineWidthPx: 3,
  carColor: '#E5E7EB',
  carSizePx: 6,
  playerColor: '#C27BFF',
  playerSizePx: 10,
  fitRotation: true,
  rotationDeg: 0,
  refreshMs: 100
} as const satisfies Record<string, RgbColor | number | boolean>

const HALF_STRENGTH = 0.5

export interface TrackMapLook {
  line: string
  lineWidth: number
  sectors: readonly (string | undefined)[]
  pitLane: string | undefined
  finish: string | undefined
  car: string
  carSize: number
  player: string
  playerSize: number
  playerRing: string | undefined
  roles: Readonly<Record<number, string | undefined>>
  classes: readonly (string | undefined)[]
  pitCar: string | undefined
  rotationDeg: number
  fitRotation: boolean
}

export interface CarPaint {
  color: string
  opacity: number
}

export function trackMapLook(configuration: TrackMapWidgetConfiguration): TrackMapLook {
  return {
    line: configuration.line_color ?? TRACK_MAP_DEFAULTS.lineColor,
    lineWidth: configuration.line_width_px ?? TRACK_MAP_DEFAULTS.lineWidthPx,
    sectors: [
      paintedColor(configuration.sector_1_color),
      paintedColor(configuration.sector_2_color),
      paintedColor(configuration.sector_3_color)
    ],
    pitLane: paintedColor(configuration.pit_lane_color),
    finish: paintedColor(configuration.finish_line_color),
    car: configuration.car_color ?? TRACK_MAP_DEFAULTS.carColor,
    carSize: configuration.car_size_px ?? TRACK_MAP_DEFAULTS.carSizePx,
    player: configuration.player_color ?? TRACK_MAP_DEFAULTS.playerColor,
    playerSize: configuration.player_size_px ?? TRACK_MAP_DEFAULTS.playerSizePx,
    playerRing: paintedColor(configuration.player_border_color),
    roles: {
      [TRACK_MAP_ROLES.ahead]: paintedColor(configuration.ahead_color),
      [TRACK_MAP_ROLES.behind]: paintedColor(configuration.behind_color),
      [TRACK_MAP_ROLES.lapping]: paintedColor(configuration.lapping_color),
      [TRACK_MAP_ROLES.lapped]: paintedColor(configuration.lapped_color)
    },
    classes: [
      paintedColor(configuration.class_1_color),
      paintedColor(configuration.class_2_color),
      paintedColor(configuration.class_3_color),
      paintedColor(configuration.class_4_color)
    ],
    pitCar: paintedColor(configuration.pit_car_color),
    rotationDeg: configuration.rotation_deg ?? TRACK_MAP_DEFAULTS.rotationDeg,
    fitRotation: configuration.fit_rotation ?? TRACK_MAP_DEFAULTS.fitRotation
  }
}

export function trackColor(
  look: TrackMapLook,
  sectored: boolean,
  sector: number,
  override: string | undefined
): string {
  if (override !== undefined) return override
  if (!sectored) return look.line
  return look.sectors[sector % look.sectors.length] ?? look.line
}

export function carPaint(look: TrackMapLook, car: TrackMapCar): CarPaint {
  const color = look.roles[car.role] ?? look.classes[car.cls - 1] ?? look.car
  if (!car.pit) return { color, opacity: 1 }
  if (look.pitCar !== undefined) return { color: look.pitCar, opacity: 1 }
  return { color, opacity: HALF_STRENGTH }
}
