import { documentFonts } from '@shared/document-fonts'
import type { FontSpec } from '@shared/configuration-schema'
import type { DeviceConfiguration } from '@shared/device'
import type { FontAssetKey } from '@shared/font-assets'

export function collectFontRequirements(configuration: DeviceConfiguration): FontAssetKey[] {
  const fonts = documentFonts(configuration).filter(
    (font): font is FontSpec => font !== undefined
  )

  const unique = new Map<string, FontAssetKey>()
  for (const font of fonts) {
    if (typeof font.family !== 'string' || typeof font.size_px !== 'number') continue
    unique.set(`${font.family}:${font.size_px}`, {
      family: font.family,
      sizePx: font.size_px
    })
  }
  return [...unique.values()].sort(
    (left, right) => left.family.localeCompare(right.family) || left.sizePx - right.sizePx
  )
}

export function missingFontFamilies(
  required: FontAssetKey[],
  installed: readonly string[]
): string[] {
  const present = new Set(installed)
  const missing: string[] = []
  for (const font of required) {
    if (!present.has(font.family) && !missing.includes(font.family)) {
      missing.push(font.family)
    }
  }
  return missing
}
