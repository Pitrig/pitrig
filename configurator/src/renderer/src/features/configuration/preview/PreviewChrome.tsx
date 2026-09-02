import {
  type AlignmentEdge,
  alignWidgets,
  distributeWidgets,
  wrapInShape,
  useDashboardEditorStore
} from '../dashboard-editor'
import { ScreenTabs } from './ScreenTabs'
import { DrillInCrumbs, SlotTabs } from './SlotTabs'
import { t } from '@shared/ui-text'

export function ArrangeToolbar(): React.JSX.Element {
  const selectedIds = useDashboardEditorStore((state) => state.selectedIds)
  const drillIn = useDashboardEditorStore((state) => state.drillIn)
  const distributable = selectedIds.length >= 3
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {drillIn ? <DrillInCrumbs /> : <ScreenTabs />}
      <SlotTabs />
      {selectedIds.length >= 1 ? (
        <>
          <span className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            title={t('canvas.previewChrome.wrapTheSelectionInA')}
            className="h-7 rounded-md border px-2 hover:bg-muted"
            onClick={() => {
              const id = wrapInShape(selectedIds)
              if (id) useDashboardEditorStore.getState().select({ type: 'widget', id })
            }}
          >
            {t('canvas.previewChrome.wrap')}</button>
          <span className="mx-1 h-4 w-px bg-border" />
        </>
      ) : null}
      {selectedIds.length >= 2 ? (
        <>
          <span className="mr-1 text-muted-foreground">{t('canvas.previewChrome.lengthSelected', { length: selectedIds.length })}</span>
          {ALIGNMENTS.map(({ edge, label, title }) => (
            <button key={edge} type="button" title={title} className="h-7 rounded-md border px-2 hover:bg-muted" onClick={() => alignWidgets(selectedIds, edge)}>
              {label}
            </button>
          ))}
          <button type="button" title={t('canvas.previewChrome.spaceEvenlyAcross')} disabled={!distributable} className="h-7 rounded-md border px-2 hover:bg-muted disabled:opacity-40" onClick={() => distributeWidgets(selectedIds, 'horizontal')}>
            ⇹
          </button>
          <button type="button" title={t('canvas.previewChrome.spaceEvenlyDown')} disabled={!distributable} className="h-7 rounded-md border px-2 hover:bg-muted disabled:opacity-40" onClick={() => distributeWidgets(selectedIds, 'vertical')}>
            ⇵
          </button>
        </>
      ) : null}
    </div>
  )
}

const ALIGNMENTS: { edge: AlignmentEdge; label: string; title: string }[] = [
  { edge: 'left', label: '⇤', title: t('canvas.previewChrome.alignLeftEdges') },
  { edge: 'center', label: '↔', title: t('canvas.previewChrome.alignHorizontalCentres') },
  { edge: 'right', label: '⇥', title: t('canvas.previewChrome.alignRightEdges') },
  { edge: 'top', label: '⤒', title: t('canvas.previewChrome.alignTopEdges') },
  { edge: 'middle', label: '↕', title: t('canvas.previewChrome.alignVerticalCentres') },
  { edge: 'bottom', label: '⤓', title: t('canvas.previewChrome.alignBottomEdges') }
]
