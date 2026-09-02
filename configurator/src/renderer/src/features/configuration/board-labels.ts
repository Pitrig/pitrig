import { BOARD_PROFILES, type SimCoreBoardId } from '@shared/device'
import { t } from '@shared/ui-text'

export const BOARD_NAMES: Record<SimCoreBoardId, string> = {
  t_display_s3: 'T-Display S3',
  guition_esp32_4848s040: 'Guition 4848S040',
  guition_jc1060p470c: 'Guition JC1060P470C',
  esp32s3_devkit: 'ESP32-S3 DevKitC-1'
}

export function boardName(board: string): string {
  return BOARD_NAMES[board as SimCoreBoardId] ?? board
}

export function boardLabel(board: SimCoreBoardId): string {
  const size = displaySize(board)
  return size ? t('dashboard.boardLabels.boardSize', { board: BOARD_NAMES[board], size: size }) : t('dashboard.boardLabels.boardNodisplay', { board: BOARD_NAMES[board], noDisplay: t('boards.noDisplay') })
}

export function displaySize(board: string): string | undefined {
  const display = BOARD_PROFILES[board as SimCoreBoardId]?.display
  return display ? t('canvas.menuEntries.widthHeight', { width: display.width, height: display.height }) : undefined
}

export function displayPixels(board: string): number {
  const display = BOARD_PROFILES[board as SimCoreBoardId]?.display
  return display ? display.width * display.height : Number.MAX_SAFE_INTEGER
}

export function fitOutcome(
  from: { width: number; height: number },
  to: { width: number; height: number },
  fit: 'contain' | 'stretch'
): string {
  if (to.width === 0 || to.height === 0) {
    return t('dashboard.boardLabels.thisBoardHasNoDisplay')
  }
  if (from.width === to.width && from.height === to.height) {
    return t('dashboard.boardLabels.theDisplayIsTheSame')
  }
  if (fit === 'stretch') {
    return t('dashboard.boardLabels.eachAxisIsScaledOn', { width: to.width, height: to.height })
  }
  const scale = Math.min(to.width / from.width, to.height / from.height)
  const width = Math.round(from.width * scale)
  const height = Math.round(from.height * scale)
  return t('dashboard.boardLabels.oneFactorForBothAxes', { width: width, height: height, width2: to.width, height2: to.height })
}
