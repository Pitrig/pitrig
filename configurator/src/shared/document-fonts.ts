import { allWidgetsOf } from './configuration-access'
import type {
  ApplicationConfiguration,
  FontSpec,
  WidgetConfiguration
} from './configuration-schema'

/**
 * Every font one widget makes the device rasterize.
 *
 * A caption belongs to the frame and every widget type has a frame, so caption
 * text on *any* type needs a font — not only on a text widget. This mirrors
 * `record_caption` in
 * firmware/services/configuration/src/configuration_validation.cpp, which walks
 * the text, shape, bar, arc, indicator, graph and image pools and requires a
 * valid family whenever `title.text` is non-empty. Getting this wrong is not a
 * cosmetic mismatch: the family never reaches the upload, and the board then
 * rejects the whole document over a font the configurator never asked for.
 *
 * A new widget type fails to compile here until its fonts are declared, so the
 * upload flow cannot silently ship a package that is missing them.
 */
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
      // None of these draw a reading as text, but all of them can carry a
      // caption, and that caption needs a face like any other.
      return caption
    case 'slot':
      // The device rejects caption text on a slot outright
      // (`invalid_slot`/"title"), so a slot never contributes a font. The
      // widgets on its pages answer for themselves — allWidgetsOf reaches them.
      return []
    default: {
      const exhaustive: never = widget
      return [exhaustive]
    }
  }
}

/**
 * Every font the document references, in document order, including the
 * `undefined` holes left by a caption or reading whose font was never set —
 * the validator needs to see those, so they are not filtered here.
 */
export function documentFonts(
  configuration: ApplicationConfiguration | undefined
): (FontSpec | undefined)[] {
  return allWidgetsOf(configuration).flatMap(widgetFonts)
}
