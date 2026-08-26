import { type ApplicationConfiguration } from '../configuration-schema'
import { documentFonts } from '../document-fonts'
import { FONT_FAMILY_PATTERN, MAXIMUM_FONT_FAMILIES, MAXIMUM_FONT_SIZE_PX } from '../font-assets'

export function findFontError(configuration: ApplicationConfiguration): string | undefined {
  const fonts = documentFonts(configuration)
  for (const font of fonts) {
    if (
      !font ||
      typeof font.family !== 'string' ||
      !FONT_FAMILY_PATTERN.test(font.family) ||
      !Number.isInteger(font.size_px) ||
      (font.size_px ?? 0) < 1 ||
      (font.size_px ?? 0) > MAXIMUM_FONT_SIZE_PX
    ) {
      return 'Every dashboard font must explicitly define a valid family and size_px.'
    }
  }
  const families = new Set(fonts.map((font) => font?.family))
  if (families.size > MAXIMUM_FONT_FAMILIES) {
    return `Configuration references more than ${MAXIMUM_FONT_FAMILIES} font families.`
  }
  return undefined
}
