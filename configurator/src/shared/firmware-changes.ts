import type { PitrigBoardId } from './device'
import { isOlder } from './version-compare'

export type FirmwareChangeKind = 'added' | 'changed' | 'fixed' | 'removed'

export type FirmwareChangeScope = 'all' | 'display' | PitrigBoardId

export interface FirmwareChange {
  kind: FirmwareChangeKind
  scopes: FirmwareChangeScope[]
  text: string
}

export interface FirmwareChangeRelease {
  version: string
  firmware?: string
  changes: FirmwareChange[]
}

export const DISPLAY_BOARDS: readonly PitrigBoardId[] = [
  't_display_s3',
  'guition_esp32_4848s040',
  'guition_jc1060p470c'
]

export function firmwareChangesFor(
  releases: readonly FirmwareChangeRelease[],
  board: PitrigBoardId,
  installed: string
): FirmwareChangeRelease[] {
  return releases
    .filter((release) => release.firmware === undefined || isOlder(installed, release.firmware))
    .map((release) => ({ ...release, changes: ordered(release.changes, board) }))
    .filter((release) => release.changes.length > 0)
}

function ordered(changes: readonly FirmwareChange[], board: PitrigBoardId): FirmwareChange[] {
  const own = changes.filter((change) => change.scopes.includes(board))
  const shared = changes.filter(
    (change) =>
      !change.scopes.includes(board) &&
      (change.scopes.includes('all') ||
        (change.scopes.includes('display') && DISPLAY_BOARDS.includes(board)))
  )
  return [...own, ...shared]
}
