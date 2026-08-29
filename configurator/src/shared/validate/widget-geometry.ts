import { type WidgetConfiguration } from '../configuration-schema'

export function findWidgetGeometryError(
  widget: WidgetConfiguration,
  label: string,
  display: { width: number; height: number } | undefined
): string | undefined {
  const box = widget.placement
  const width = box?.width ?? 0
  const height = box?.height ?? 0

  if (display) {
    const padding = widget.padding
    if ((padding?.left ?? 0) > display.width || (padding?.right ?? 0) > display.width) {
      return `${label} pads further than the display is wide.`
    }
    if ((padding?.top ?? 0) > display.height || (padding?.bottom ?? 0) > display.height) {
      return `${label} pads further than the display is tall.`
    }
  }

  const claimed = 2 * ((widget.background_inset_px ?? 0) + (widget.border?.width_px ?? 0))
  if (width <= 0 || height <= 0) {
    return `${label} has no size; the device needs a width and a height above zero.`
  }
  if (claimed >= width || claimed >= height) {
    return `${label} spends ${claimed} pixels on its border and inset, which its ${width}×${height} box has no room for.`
  }

  const ringed = widget.type === 'arc'
    || (widget.type === 'indicator' && (widget.shape ?? 'strip') === 'arc')
  if (ringed) {
    const thickness = widget.thickness_px ?? 8
    const radius = widget.radius_px ?? 0
    if (radius === 0 && 2 * thickness > Math.min(width, height)) {
      return `${label} is ${thickness} pixels thick, which does not fit twice across its ${width}×${height} box. Give it a radius of its own, or make the box bigger.`
    }
    if (radius !== 0 && thickness > 2 * radius) {
      return `${label} is ${thickness} pixels thick, which is more than its ${radius}-pixel radius can carry.`
    }
  }
  return undefined
}
