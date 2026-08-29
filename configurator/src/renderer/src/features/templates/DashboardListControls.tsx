import { displaySize } from '@/features/configuration/board-labels'
import {
  useEditorPanelStore,
  type TemplateSort
} from '@/features/configuration/editor/panel-store'
import type { DashboardTemplateSummary } from '@shared/templates'
import { EVERY_BOARD, boardsPresent } from './dashboard-listing'

const CONTROL = 'h-6 rounded-md border bg-transparent px-1 text-xs text-foreground'

export function DashboardListControls({
  entries
}: {
  entries: readonly DashboardTemplateSummary[]
}): React.JSX.Element | null {
  const sort = useEditorPanelStore((state) => state.templateSort)
  const setSort = useEditorPanelStore((state) => state.setTemplateSort)
  const board = useEditorPanelStore((state) => state.templateBoard)
  const setBoard = useEditorPanelStore((state) => state.setTemplateBoard)
  const boards = boardsPresent(entries)
  if (entries.length < 2) return null
  return (
    <>
      {boards.length > 1 ? (
        <select
          aria-label="Show dashboards for"
          className={CONTROL}
          title="Show only the dashboards drawn for one display size"
          value={boards.includes(board) ? board : EVERY_BOARD}
          onChange={(event) => setBoard(event.target.value)}
        >
          <option value={EVERY_BOARD}>{`All sizes (${entries.length})`}</option>
          {boards.map((id) => (
            <option key={id} value={id}>
              {`${displaySize(id) ?? id} (${entries.filter((entry) => entry.board === id).length})`}
            </option>
          ))}
        </select>
      ) : null}
      <select
        aria-label="Order dashboards"
        className={CONTROL}
        title="Smallest display first, or by name"
        value={sort}
        onChange={(event) => setSort(event.target.value as TemplateSort)}
      >
        <option value="size">Screen size</option>
        <option value="name">Name</option>
      </select>
    </>
  )
}
