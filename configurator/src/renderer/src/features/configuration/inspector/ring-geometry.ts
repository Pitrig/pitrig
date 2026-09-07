import type {
  ArcWidgetConfiguration,
  IndicatorWidgetConfiguration
} from '@shared/configuration-schema'
import { isNeedleArc } from '@shared/configuration-access'
import { fittedRingRadius } from '../preview/arc-geometry'
import { contentArea } from '../preview/preview-geometry-paint'

export type RingWidget = ArcWidgetConfiguration | IndicatorWidgetConfiguration

export function fittedRadius(widget: RingWidget, thickness: number): number {
  const box = {
    x: 0,
    y: 0,
    width: widget.placement?.width ?? 0,
    height: widget.placement?.height ?? 0
  }
  return fittedRingRadius(
    contentArea(box, widget.border?.width_px ?? 0, widget.padding),
    thickness
  )
}

export function ringSummary(widget: RingWidget): string {
  const radius = widget.radius_px ?? 0
  const angles = `${widget.center_angle_deg ?? 270}° ± ${(widget.sector_deg ?? 270) / 2}°`
  return radius === 0 ? angles : `${angles} · ${isNeedleArc(widget) ? 'L' : 'r'}${radius}`
}
