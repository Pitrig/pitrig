import type { HardwareDeviceConfiguration } from '@shared/configuration-schema'
import { t } from '@shared/ui-text'
import { layerName } from './layer-name'

export function hoverText(
  device: HardwareDeviceConfiguration,
  coverage: readonly ReadonlySet<number>[],
  order: readonly number[],
  lamp: number
): string {
  const effects = device.effects ?? []
  const covering = effects.flatMap((effect, index) =>
    coverage[index]?.has(lamp) ? [layerName(effect, index)] : []
  )
  if (covering.length === 0) return t('modules.ledPreview.lampNumberNoLayer', { number: lamp + 1 })
  const top = [...order].reverse().find((index) => coverage[index]?.has(lamp))
  const names = [...new Set(covering)].join(', ')
  return top === undefined
    ? t('modules.ledPreview.lampNumberLayers', { number: lamp + 1, names })
    : t('modules.ledPreview.lampNumberLayersOnTop', {
        number: lamp + 1,
        names,
        top: layerName(effects[top] ?? {}, top)
      })
}

export function pickingHint(
  device: HardwareDeviceConfiguration,
  zone: boolean,
  editing: boolean,
  effect: number
): string {
  const strip = device.type === 'rgb_strip'
  if (zone && strip) return t('modules.ledPreview.clickLampsForTheNewLayer')
  const primary = (device.effects ?? [])[effect]
  if (!editing || !primary) return t('modules.ledPreview.clickALampToPick')
  const name = layerName(primary, effect)
  return strip
    ? t('modules.ledPreview.dragAcrossLampsToSet', { name })
    : t('modules.ledPreview.clickPixelsToShowName', { name })
}
