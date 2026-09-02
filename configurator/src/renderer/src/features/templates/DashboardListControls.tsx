import { displaySize } from '@/features/configuration/board-labels'
import {
  useEditorPanelStore,
  type TemplateSort
} from '@/features/configuration/editor/panel-store'
import type { DashboardTemplateSummary } from '@shared/templates'
import { EVERY_BOARD, boardsPresent } from './dashboard-listing'
import { t } from '@shared/ui-text'

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
          aria-label={t('templates.dashboardListControls.showDashboardsFor')}
          className={CONTROL}
          title={t('templates.dashboardListControls.showOnlyTheDashboardsDrawn')}
          value={boards.includes(board) ? board : EVERY_BOARD}
          onChange={(event) => setBoard(event.target.value)}
        >
          <option value={EVERY_BOARD}>{t('templates.dashboardListControls.allSizesLength', { length: entries.length })}</option>
          {boards.map((id) => (
            <option key={id} value={id}>
              {`${displaySize(id) ?? id} (${entries.filter((entry) => entry.board === id).length})`}
            </option>
          ))}
        </select>
      ) : null}
      <select
        aria-label={t('templates.dashboardListControls.orderDashboards')}
        className={CONTROL}
        title={t('templates.dashboardListControls.smallestDisplayFirstOrBy')}
        value={sort}
        onChange={(event) => setSort(event.target.value as TemplateSort)}
      >
        <option value="size">{t('templates.dashboardListControls.screenSize')}</option>
        <option value="name">{t('device.infoPage.name')}</option>
      </select>
    </>
  )
}
