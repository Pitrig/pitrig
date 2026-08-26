import {
  type AlignmentEdge,
  alignWidgets,
  distributeWidgets,
  wrapInShape,
  useDashboardEditorStore
} from '../dashboard-editor'
import { ScreenTabs } from './ScreenTabs'
import { DrillInCrumbs, SlotTabs } from './SlotTabs'

export function ArrangeToolbar(): React.JSX.Element {
  const selectedIds = useDashboardEditorStore((state) => state.selectedIds)
  const drillIn = useDashboardEditorStore((state) => state.drillIn)
  const distributable = selectedIds.length >= 3
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {drillIn ? <DrillInCrumbs /> : <ScreenTabs />}
      <SlotTabs />
      <span className="mx-1 h-4 w-px bg-border" />
      {selectedIds.length >= 1 ? (
        <>
          <button
            type="button"
            title="Wrap the selection in a container (Cmd/Ctrl+G)"
            className="h-7 rounded-md border px-2 hover:bg-muted"
            onClick={() => {
              const id = wrapInShape(selectedIds)
              if (id) useDashboardEditorStore.getState().select({ type: 'widget', id })
            }}
          >
            Wrap
          </button>
          <span className="mx-1 h-4 w-px bg-border" />
        </>
      ) : null}
      {selectedIds.length >= 2 ? (
        <>
          <span className="mr-1 text-muted-foreground">{`${selectedIds.length} selected`}</span>
          {ALIGNMENTS.map(({ edge, label, title }) => (
            <button key={edge} type="button" title={title} className="h-7 rounded-md border px-2 hover:bg-muted" onClick={() => alignWidgets(selectedIds, edge)}>
              {label}
            </button>
          ))}
          <button type="button" title="Space evenly across" disabled={!distributable} className="h-7 rounded-md border px-2 hover:bg-muted disabled:opacity-40" onClick={() => distributeWidgets(selectedIds, 'horizontal')}>
            ⇹
          </button>
          <button type="button" title="Space evenly down" disabled={!distributable} className="h-7 rounded-md border px-2 hover:bg-muted disabled:opacity-40" onClick={() => distributeWidgets(selectedIds, 'vertical')}>
            ⇵
          </button>
        </>
      ) : null}
    </div>
  )
}

const ALIGNMENTS: { edge: AlignmentEdge; label: string; title: string }[] = [
  { edge: 'left', label: '⇤', title: 'Align left edges' },
  { edge: 'center', label: '↔', title: 'Align horizontal centres' },
  { edge: 'right', label: '⇥', title: 'Align right edges' },
  { edge: 'top', label: '⤒', title: 'Align top edges' },
  { edge: 'middle', label: '↕', title: 'Align vertical centres' },
  { edge: 'bottom', label: '⤓', title: 'Align bottom edges' }
]
