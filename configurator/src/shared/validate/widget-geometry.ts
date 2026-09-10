import { isNeedleArc } from '../configuration-access'
import { type WidgetConfiguration } from '../configuration-schema'
import { t } from '../ui-text'

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
      return t('validation.widgetGeometry.labelPadsFurtherThanThe', { label: label })
    }
    if ((padding?.top ?? 0) > display.height || (padding?.bottom ?? 0) > display.height) {
      return t('validation.widgetGeometry.labelPadsFurtherThanThe2', { label: label })
    }
  }

  const claimed = 2 * ((widget.background_inset_px ?? 0) + (widget.border?.width_px ?? 0))
  if (width <= 0 || height <= 0) {
    return t('validation.widgetGeometry.labelHasNoSizeThe', { label: label })
  }
  if (claimed >= width || claimed >= height) {
    return t('validation.widgetGeometry.labelSpendsClaimedPixelsOn', { label: label, claimed: claimed, width: width, height: height })
  }

  const ringed = widget.type === 'arc'
    || (widget.type === 'indicator' && (widget.shape ?? 'strip') === 'arc')
  if (ringed) {
    const thickness = widget.thickness_px ?? 8
    const radius = widget.radius_px ?? 0
    const needle = isNeedleArc(widget)
    if (radius === 0 && 2 * thickness > Math.min(width, height)) {
      return needle
        ? t('validation.widgetGeometry.labelIsThicknessPixelsThick3', { label: label, thickness: thickness, width: width, height: height })
        : t('validation.widgetGeometry.labelIsThicknessPixelsThick', { label: label, thickness: thickness, width: width, height: height })
    }
    if (radius !== 0 && thickness > 2 * radius) {
      return needle
        ? t('validation.widgetGeometry.labelIsThicknessPixelsThick4', { label: label, thickness: thickness, radius: radius })
        : t('validation.widgetGeometry.labelIsThicknessPixelsThick2', { label: label, thickness: thickness, radius: radius })
    }
    const side = 2 * radius + thickness
    if (widget.type === 'arc' && widget.fill_grad_color !== undefined && radius !== 0 && display && side > Math.max(display.width, display.height)) {
      return t('validation.widgetGeometry.labelPaintsItsGradientFrom', { label: label, side: side })
    }
  }
  return undefined
}
