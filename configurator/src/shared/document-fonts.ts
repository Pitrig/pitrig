import { allWidgetsOf } from './configuration-access'
import type {
  ApplicationConfiguration,
  FontSpec,
  WidgetConfiguration
} from './configuration-schema'

export function widgetFonts(widget: WidgetConfiguration): (FontSpec | undefined)[] {
  const caption = widget.title?.text ? [widget.title.font] : []
  switch (widget.type) {
    case 'text':
      return [...caption, widget.value?.font]
    case 'shape':
    case 'bar':
    case 'arc':
    case 'indicator':
    case 'graph':
    case 'image':
      return caption
    case 'slot':
      return []
    default: {
      const exhaustive: never = widget
      return [exhaustive]
    }
  }
}

export function documentFonts(
  configuration: ApplicationConfiguration | undefined
): (FontSpec | undefined)[] {
  return allWidgetsOf(configuration)
    .flatMap(widgetFonts)
    .flatMap((font) =>
      font?.fallback
        ? [font, { family: font.fallback, size_px: font.size_px }]
        : [font]
    )
}

export function applyFontFamily(widget: WidgetConfiguration, family: string): void {
  if (widget.type === 'slot') return
  if (widget.title?.font) {
    widget.title = { ...widget.title, font: { ...widget.title.font, family } }
  }
  if (widget.type === 'text' && widget.value?.font) {
    widget.value = { ...widget.value, font: { ...widget.value.font, family } }
  }
}
