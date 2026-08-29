import { BOARD_PROFILES, type SimCoreBoardId } from '@shared/device'

export const BOARD_NAMES: Record<SimCoreBoardId, string> = {
  t_display_s3: 'T-Display S3',
  guition_esp32_4848s040: 'Guition 4848S040',
  guition_jc1060p470c: 'Guition JC1060P470C'
}

export function boardName(board: string): string {
  return BOARD_NAMES[board as SimCoreBoardId] ?? board
}

export function boardLabel(board: SimCoreBoardId): string {
  const { width, height } = BOARD_PROFILES[board].display
  return `${BOARD_NAMES[board]} · ${width} × ${height}`
}

export function displaySize(board: string): string | undefined {
  const profile = BOARD_PROFILES[board as SimCoreBoardId]
  return profile ? `${profile.display.width} × ${profile.display.height}` : undefined
}

export function displayPixels(board: string): number {
  const profile = BOARD_PROFILES[board as SimCoreBoardId]
  return profile ? profile.display.width * profile.display.height : Number.MAX_SAFE_INTEGER
}

export function fitOutcome(
  from: { width: number; height: number },
  to: { width: number; height: number },
  fit: 'contain' | 'stretch'
): string {
  if (from.width === to.width && from.height === to.height) {
    return 'The display is the same size, so nothing moves.'
  }
  if (fit === 'stretch') {
    return `Each axis is scaled on its own, so the layout fills all ${to.width} × ${to.height}. Round shapes become oval.`
  }
  const scale = Math.min(to.width / from.width, to.height / from.height)
  const width = Math.round(from.width * scale)
  const height = Math.round(from.height * scale)
  return `One factor for both axes, centred: the layout becomes ${width} × ${height} on a ${to.width} × ${to.height} display.`
}
