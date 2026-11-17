import type { ImageAssetState } from '@shared/image-assets'
import {
  boardImageHashes,
  sameGeometry,
  type ImageLibrarySnapshot
} from '@shared/image-library'

export type BoardImageStatus = 'same' | 'differs' | 'absent'

export function boardStatuses(
  library: ImageLibrarySnapshot,
  board: ImageAssetState | undefined
): Map<string, BoardImageStatus> {
  const statuses = new Map<string, BoardImageStatus>()
  if (!board) return statuses
  const hashes = boardImageHashes(board, library.installed)
  for (const entry of library.entries) {
    const installed = board.images.find((image) => image.name === entry.id)
    if (!installed) statuses.set(entry.id, 'absent')
    else if (!sameGeometry(entry, installed)) statuses.set(entry.id, 'differs')
    else if (hashes?.has(entry.id) && hashes.get(entry.id) !== entry.sha256) statuses.set(entry.id, 'differs')
    else statuses.set(entry.id, 'same')
  }
  return statuses
}
