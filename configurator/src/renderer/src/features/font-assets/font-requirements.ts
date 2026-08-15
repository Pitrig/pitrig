import { allWidgetsOf } from '../../../../shared/configuration-access'
import type { FontSpec, WidgetConfiguration } from '../../../../shared/configuration-schema'
import type { DeviceConfiguration } from '../../../../shared/device'
import type { FontAssetKey } from '../../../../shared/font-assets'

// Every font a widget can reference, in one exhaustive place. A new widget
// type fails to compile here until its fonts are declared, so the upload flow
// cannot silently ship a package that is missing them.
function widgetFonts(widget: WidgetConfiguration): (FontSpec | undefined)[] {
  switch (widget.type) {
    case 'delta_time':
      return [widget.font]
    case 'text':
      return [widget.title?.text ? widget.title.font : undefined, widget.value?.font]
    default: {
      const exhaustive: never = widget
      return [exhaustive]
    }
  }
}

export function collectFontRequirements(configuration: DeviceConfiguration): FontAssetKey[] {
  const fonts = allWidgetsOf(configuration)
    .flatMap(widgetFonts)
    .filter((font): font is FontSpec => font !== undefined)

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

export function missingFontRequirements(
  required: FontAssetKey[],
  installed: FontAssetKey[]
): FontAssetKey[] {
  const installedKeys = new Set(installed.map(fontKey))
  return required.filter((font) => !installedKeys.has(fontKey(font)))
}

export function groupFontRequirements(required: FontAssetKey[]): Map<string, number[]> {
  const groups = new Map<string, number[]>()
  for (const font of required) {
    const sizes = groups.get(font.family) ?? []
    sizes.push(font.sizePx)
    groups.set(font.family, sizes)
  }
  return groups
}

export function fontKey(font: FontAssetKey): string {
  return `${font.family}:${font.sizePx}`
}
