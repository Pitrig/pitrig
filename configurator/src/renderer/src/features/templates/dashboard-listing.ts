import { displayPixels } from '@/features/configuration/board-labels'
import type { TemplateSort } from '@/features/configuration/editor/panel-store'
import type { DashboardTemplateSummary } from '@shared/templates'

export const EVERY_BOARD = ''

export function boardsPresent(entries: readonly DashboardTemplateSummary[]): readonly string[] {
  return [...new Set(entries.map((entry) => entry.board))].sort(
    (left, right) => displayPixels(left) - displayPixels(right)
  )
}

export function effectiveBoard(
  entries: readonly DashboardTemplateSummary[],
  board: string
): string {
  return boardsPresent(entries).includes(board) ? board : EVERY_BOARD
}

export function listedDashboards(
  entries: readonly DashboardTemplateSummary[],
  board: string,
  sort: TemplateSort
): readonly DashboardTemplateSummary[] {
  const byName = (left: DashboardTemplateSummary, right: DashboardTemplateSummary): number =>
    left.name.localeCompare(right.name)
  return entries
    .filter((entry) => board === EVERY_BOARD || entry.board === board)
    .sort((left, right) => {
      const size = displayPixels(left.board) - displayPixels(right.board)
      if (sort === 'name') return byName(left, right) || size
      return size || byName(left, right)
    })
}
