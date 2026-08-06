import type { DeviceConfiguration, FontSpec } from '../../../../shared/device'
import type { FontAssetKey } from '../../../../shared/font-assets'

export function collectFontRequirements(configuration: DeviceConfiguration): FontAssetKey[] {
  const fonts: FontSpec[] = []
  const widgets = configuration.dashboard?.widgets
  if (widgets?.delta_time?.font) fonts.push(widgets.delta_time.font)
  for (const widget of widgets?.text ?? []) {
    if (widget.title?.text && widget.title.font) fonts.push(widget.title.font)
    if (widget.value?.font) fonts.push(widget.value.font)
  }

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
