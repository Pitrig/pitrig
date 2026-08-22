import { type WidgetConfiguration } from '../configuration-schema'

// The bounds that are about a widget's own box rather than about one property,
// mirroring Validator::frame and Validator::arc_widget. The schema states each
// of these properties as a plain range, and the device applies that range *and*
// then asks whether the box has room for what was asked — a border of 30 is in
// range everywhere and impossible on a widget 60 pixels tall.

/**
 * A widget the device would refuse for its box, or undefined.
 *
 * `display` is absent when the document names a board this build has no profile
 * for; the two padding bounds are then simply not checked, exactly as the
 * on-display bound is not.
 */
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

  // The inset eats into the widget from both sides and the border sits inside
  // that, so together they cannot claim the whole box. Mirrors the
  // background_inset_px rejection in Validator::frame — including the case with
  // nothing to spend, which is how the device refuses a box of no size at all:
  // every placement field defaults to zero, so a widget that names none is a
  // widget the board cannot draw.
  const claimed = 2 * ((widget.background_inset_px ?? 0) + (widget.border?.width_px ?? 0))
  if (width <= 0 || height <= 0) {
    return `${label} has no size; the device needs a width and a height above zero.`
  }
  if (claimed >= width || claimed >= height) {
    return `${label} spends ${claimed} pixels on its border and inset, which its ${width}×${height} box has no room for.`
  }

  // Two arcs of the configured thickness have to fit across the widget, or the
  // ring closes into a disc.
  if (widget.type === 'arc') {
    const thickness = widget.thickness_px ?? 8
    if (2 * thickness > Math.min(width, height)) {
      return `${label} is ${thickness} pixels thick, which does not fit twice across its ${width}×${height} box.`
    }
  }
  return undefined
}
