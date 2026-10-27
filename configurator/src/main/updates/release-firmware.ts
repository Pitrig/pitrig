import { app } from 'electron'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { PitrigBoardId } from '../../shared/device'
import { downloadAsset, releaseTagged, type ReleaseAsset } from './release-feed'
import { t } from '@shared/ui-text'

export const RELEASED_FIRMWARE_VERSION = __PITRIG_FIRMWARE_VERSION__

const RELEASE_IMAGES: Record<PitrigBoardId, string> = {
  t_display_s3: 'pitrig-t-display-s3.bin',
  guition_esp32_4848s040: 'pitrig-guition-4848s040.bin',
  guition_jc1060p470c: 'pitrig-jc1060p470c.bin',
  esp32s3_devkit: 'pitrig-esp32s3-devkit.bin'
}

export async function fetchReleasedFirmware(
  board: PitrigBoardId,
  onProgress: (fraction: number) => void
): Promise<string> {
  const version = app.getVersion()
  const name = RELEASE_IMAGES[board]
  const release = await releaseTagged(version)
  const asset = release?.assets.find((candidate) => candidate.name === name)
  if (!asset) throw new Error(t('updates.firmware.notInRelease', { name, version }))
  const path = join(app.getPath('userData'), 'firmware-downloads', `v${version}`, name)
  if (!(await holds(path, asset))) await downloadAsset(asset, path, onProgress)
  return path
}

async function holds(path: string, asset: ReleaseAsset): Promise<boolean> {
  try {
    const bytes = await readFile(path)
    if (bytes.byteLength !== asset.size) return false
    return (
      asset.sha256 === undefined ||
      createHash('sha256').update(bytes).digest('hex') === asset.sha256
    )
  } catch {
    return false
  }
}
