import type { BenchImageAsset } from '../../shared/bench-widgets'
import type { DeviceResult } from '../../shared/device'
import { DEFAULT_FONT_FAMILY } from '../../shared/font-assets'
import { failure, success } from '../device/device-errors'
import type { DeviceService } from '../device/device-service'
import type { FontAssetService } from '../font-assets/font-asset-service'
import type { ImageAssetService } from '../image-assets/image-asset-service'
import { BENCH_IMAGE_NAME, writeBenchSprite } from './bench-sprite'

const SPRITE_FRAMES = 12

export interface BenchAssetServices {
  deviceService: DeviceService
  fontAssets: FontAssetService
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
  report: (message: string) => void
): Promise<DeviceResult<BenchAssetsReady>> {
  const { deviceService } = services
  const notes: string[] = []
  if (!deviceService.getState().session) {
    return failure({ code: 'serial_error', message: 'No SimCore board is connected.' })
  }

  const font = await ensureFamily(services, report, notes)
  if (!font.ok) return font
  const image = await ensureImage(services, spriteEdge, report, notes)
  if (!image.ok) return image

  return success({ ...font.value, ...image.value, notes })
}

async function ensureFamily(
  services: BenchAssetServices,
  report: (message: string) => void,
  notes: string[]
): Promise<DeviceResult<{ family?: string }>> {
  const { deviceService, fontAssets } = services
  const installed = deviceService.getState().session?.fontAssets
  if (installed?.families.length) return success({ family: installed.families[0] })
  if (!installed?.storageAvailable) {
    notes.push('The board has no font storage, so the pattern carries no text.')
    return success({})
  }
  if (installed.rebootRequired) {
    const restarted = await restart(deviceService, report)
    if (!restarted.ok) return restarted
  }

  report('Uploading fonts…')
  const uploaded = await fontAssets.upload({ families: [DEFAULT_FONT_FAMILY] }, () => undefined)
  if (!uploaded.ok) {
    return failure({ code: 'configuration_rejected', message: uploaded.error.message })
  }
  const restarted = await restart(deviceService, report)
  if (!restarted.ok) return restarted

  const family = deviceService.getState().session?.fontAssets?.families[0]
  if (family === undefined) {
    notes.push('The board reported no font family after the upload; the pattern carries no text.')
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
