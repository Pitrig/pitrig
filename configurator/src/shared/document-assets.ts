import { allWidgetsOf } from './configuration-access'
import type { ApplicationConfiguration, FontSpec } from './configuration-schema'
import { documentFonts } from './document-fonts'

export interface AssetRenames {
  images: ReadonlyMap<string, string>
  fonts: ReadonlyMap<string, string>
}

export function documentImageIds(configuration: ApplicationConfiguration | undefined): string[] {
  const ids = allWidgetsOf(configuration).flatMap((widget) =>
    widget.type === 'image' && widget.image ? [widget.image] : []
  )
  return [...new Set(ids)].sort()
}

export function documentFamilyIds(configuration: ApplicationConfiguration | undefined): string[] {
  const families = documentFonts(configuration)
    .map((font) => font?.family)
    .filter((family): family is string => Boolean(family))
  return [...new Set(families)].sort()
}

export function renameDocumentAssets<T extends ApplicationConfiguration>(
  configuration: T,
  renames: AssetRenames
): T {
  if (renames.images.size === 0 && renames.fonts.size === 0) return configuration
  const copy = structuredClone(configuration)
  for (const widget of allWidgetsOf(copy)) {
    if (widget.type === 'image' && widget.image) {
      widget.image = renames.images.get(widget.image) ?? widget.image
    }
    if (widget.title?.font) widget.title.font = renamedFont(widget.title.font, renames.fonts)
    if (widget.type === 'text' && widget.value?.font) {
      widget.value.font = renamedFont(widget.value.font, renames.fonts)
    }
  }
  return copy
}

function renamedFont(font: FontSpec, renames: ReadonlyMap<string, string>): FontSpec {
  const renamed = { ...font }
  if (font.family) renamed.family = renames.get(font.family) ?? font.family
  if (font.fallback) renamed.fallback = renames.get(font.fallback) ?? font.fallback
  return renamed
}

export function freeAssetId(
  wanted: string,
  taken: (id: string) => boolean,
  pattern: RegExp
): string | undefined {
  if (!taken(wanted) && pattern.test(wanted)) return wanted
  for (let index = 2; index < 1000; ++index) {
    const suffix = `-${index}`
    const candidate = `${wanted.slice(0, 31 - suffix.length).replace(/-+$/, '')}${suffix}`
    if (pattern.test(candidate) && !taken(candidate)) return candidate
  }
  return undefined
}
