import type {
  ArcWidgetConfiguration,
  IndicatorWidgetConfiguration
} from '@shared/configuration-schema'
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
  const angles = `${widget.start_angle_deg ?? 135}° + ${widget.sweep_deg ?? 270}°`
  return radius === 0 ? angles : `${angles} · r${radius}`
}
