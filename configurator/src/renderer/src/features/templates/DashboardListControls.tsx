import { displaySize } from '@/features/configuration/board-labels'
import {
  useEditorPanelStore,
  type TemplateSort
} from '@/features/configuration/editor/panel-store'
import type { DashboardTemplateSummary } from '@shared/templates'
import { EVERY_BOARD, boardsPresent, effectiveBoard } from './dashboard-listing'
import { t } from '@shared/ui-text'
import { Select } from '@/components/ui/select'

const CONTROL = 'h-6 bg-transparent px-1.5'

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
        <Select
          aria-label={t('templates.dashboardListControls.showDashboardsFor')}
          className={CONTROL}
          title={t('templates.dashboardListControls.showOnlyTheDashboardsDrawn')}
          value={effectiveBoard(entries, board)}
          options={[
            { value: EVERY_BOARD, label: t('templates.dashboardListControls.allSizesLength', { length: entries.length }) },
            ...boards.map((id) => ({
              value: id,
              label: `${displaySize(id) ?? id} (${entries.filter((entry) => entry.board === id).length})`
            }))
          ]}
          onChange={setBoard}
        />
      ) : null}
      <Select<TemplateSort>
        aria-label={t('templates.dashboardListControls.orderDashboards')}
        className={CONTROL}
        title={t('templates.dashboardListControls.smallestDisplayFirstOrBy')}
        value={sort}
        options={[
          { value: 'size', label: t('templates.dashboardListControls.screenSize') },
          { value: 'name', label: t('device.infoPage.name') }
        ]}
        onChange={setSort}
      />
    </>
  )
}
