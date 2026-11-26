import { app } from 'electron'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { PitrigBoardId } from '../../shared/device'
import { BOARD_INSTALL } from '../../shared/first-install'
import { downloadAsset, releaseTagged, type ReleaseAsset } from './release-feed'
import { t } from '@shared/ui-text'

export const RELEASED_FIRMWARE_VERSION = __PITRIG_FIRMWARE_VERSION__

export class MissingReleaseAsset extends Error {
  constructor(
    readonly asset: string,
    readonly version: string,
    readonly published: boolean
  ) {
    super(t('updates.firmware.notInRelease', { name: asset, version }))
  }
}

export function fetchReleasedFirmware(
  board: PitrigBoardId,
  onProgress: (fraction: number) => void
): Promise<string> {
  return fetchReleased(`pitrig-${BOARD_INSTALL[board].release}.bin`, onProgress)
}

export async function fetchReleasedArchive(
  board: PitrigBoardId,
  onProgress: (fraction: number) => void,
  signal: AbortSignal
): Promise<Buffer> {
  const name = `firmware-${BOARD_INSTALL[board].release}.tar.gz`
  return readFile(await fetchReleased(name, onProgress, signal))
}

async function fetchReleased(
  name: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal
): Promise<string> {
  const version = app.getVersion()
  const release = await releaseTagged(version)
  const asset = release?.assets.find((candidate) => candidate.name === name)
  if (!asset) throw new MissingReleaseAsset(name, version, release !== undefined)
  const path = join(app.getPath('userData'), 'firmware-downloads', `v${version}`, name)
  if (!(await holds(path, asset))) await downloadAsset(asset, path, onProgress, signal)
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
