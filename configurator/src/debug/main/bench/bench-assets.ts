import type { BenchImageAsset } from '@debug-shared/bench-widgets'
import type { DeviceResult } from '@shared/device'
import { DEFAULT_FONT_FAMILY, MAXIMUM_FONT_FAMILIES } from '@shared/font-assets'
import { ICON_FAMILY } from '@shared/icon-glyphs'
import { failure, success } from '@main/device/device-errors'
import type { DeviceService } from '@main/device/device-service'
import type { FontAssetService } from '@main/font-assets/font-asset-service'
import type { FontLibraryService } from '@main/font-library/font-library-service'
import type { ImageAssetService } from '@main/image-assets/image-asset-service'
import { BENCH_IMAGE_NAME, writeBenchSprite } from './bench-sprite'

const SPRITE_FRAMES = 12

export interface BenchAssetServices {
  deviceService: DeviceService
  fontAssets: FontAssetService
  fontLibrary: FontLibraryService
  imageAssets: ImageAssetService
}

export interface BenchAssetsReady {
  family?: string
  image?: BenchImageAsset
  notes: string[]
}

export async function ensureBenchAssets(
  services: BenchAssetServices,
  spriteEdge: number,
  characters: string,
  report: (message: string) => void
): Promise<DeviceResult<BenchAssetsReady>> {
  const { deviceService } = services
  const notes: string[] = []
  if (!deviceService.getState().session) {
    return failure({ code: 'serial_error', message: 'No Pitrig board is connected.' })
  }

  const font = await ensureFamily(services, characters, report, notes)
  if (!font.ok) return font
  const image = await ensureImage(services, spriteEdge, report, notes)
  if (!image.ok) return image

  return success({ ...font.value, ...image.value, notes })
}

async function textFamily(
  library: FontLibraryService,
  families: readonly string[],
  characters: string
): Promise<string | undefined> {
  const preferred = families.includes(DEFAULT_FONT_FAMILY)
    ? [DEFAULT_FONT_FAMILY, ...families.filter((family) => family !== DEFAULT_FONT_FAMILY)]
    : families
  let unverified: string | undefined
  for (const family of preferred) {
    const covers = await library.covers(family, characters)
    if (covers) return family
    if (covers === undefined && unverified === undefined && family !== ICON_FAMILY) {
      unverified = family
    }
  }
  return unverified
}

async function ensureFamily(
  services: BenchAssetServices,
  characters: string,
  report: (message: string) => void,
  notes: string[]
): Promise<DeviceResult<{ family?: string }>> {
  const { deviceService, fontAssets, fontLibrary } = services
  const installed = deviceService.getState().session?.fontAssets
  const present = installed && (await textFamily(fontLibrary, installed.families, characters))
  if (present) return success({ family: present })
  if (!installed?.storageAvailable) {
    notes.push('The board has no font storage, so the pattern carries no text.')
    return success({})
  }
  if (installed.rebootRequired) {
    const restarted = await restart(deviceService, report)
    if (!restarted.ok) return restarted
  }

  const keep = (deviceService.getState().session?.fontAssets?.families ?? installed.families).slice(
    0,
    MAXIMUM_FONT_FAMILIES - 1
  )
  report('Uploading fonts…')
  const uploaded = await fontAssets.upload(
    { families: [...keep, DEFAULT_FONT_FAMILY] },
    () => undefined
  )
  if (!uploaded.ok) {
    return failure({ code: 'configuration_rejected', message: uploaded.error.message })
  }
  const restarted = await restart(deviceService, report)
  if (!restarted.ok) return restarted

  const family = await textFamily(
    fontLibrary,
    deviceService.getState().session?.fontAssets?.families ?? [],
    characters
  )
  if (family === undefined) {
    notes.push('The board reported no text font after the upload; the pattern carries no text.')
  }
  return success({ family })
}

async function ensureImage(
  services: BenchAssetServices,
  spriteEdge: number,
  report: (message: string) => void,
  notes: string[]
): Promise<DeviceResult<{ image?: BenchImageAsset }>> {
  const { deviceService, imageAssets } = services
  const installed = deviceService.getState().session?.imageAssets
  const present = installed?.images.find((image) => image.name === BENCH_IMAGE_NAME)
  if (present) {
    return success({ image: { name: present.name, frameCount: present.frameCount } })
  }
  const first = installed?.images[0]
  if (first) {
    return success({ image: { name: first.name, frameCount: first.frameCount } })
  }
  if (!installed?.storageAvailable) {
    notes.push('The board has no image storage, so the pattern carries no bitmap.')
    return success({})
  }
  if (installed.rebootRequired) {
    const restarted = await restart(deviceService, report)
    if (!restarted.ok) return restarted
  }

  report('Building sprites…')
  const sheet = await writeBenchSprite(spriteEdge, SPRITE_FRAMES)
  const sourceIds: string[] = []
  for (const [index, path] of sheet.paths.entries()) {
    const registered = imageAssets.registerSource(path, {
      id: `bench-sprite-${index}`,
      name: `${BENCH_IMAGE_NAME}-${index}`
    })
    if (!registered.ok) {
      return failure({ code: 'configuration_rejected', message: registered.error.message })
    }
    sourceIds.push(registered.value.id)
  }

  report('Uploading sprites…')
  const uploaded = await imageAssets.upload({
    assets: [
      {
        sourceIds,
        name: BENCH_IMAGE_NAME,
        format: 'rgb565',
        width: sheet.edge,
        height: sheet.edge
      }
    ]
  })
  if (!uploaded.ok) {
    return failure({ code: 'configuration_rejected', message: uploaded.error.message })
  }
  const restarted = await restart(deviceService, report)
  if (!restarted.ok) return restarted

  const image = deviceService
    .getState()
    .session?.imageAssets?.images.find((entry) => entry.name === BENCH_IMAGE_NAME)
  if (image === undefined) {
    notes.push('The board reported no image after the upload; the pattern carries no bitmap.')
    return success({})
  }
  return success({ image: { name: image.name, frameCount: image.frameCount } })
}

async function restart(
  deviceService: DeviceService,
  report: (message: string) => void
): Promise<DeviceResult<undefined>> {
  report('Restarting board…')
  const result = await deviceService.rebootAndReconnect()
  if (!result.ok) return failure(result.error)
  return success(undefined)
}
