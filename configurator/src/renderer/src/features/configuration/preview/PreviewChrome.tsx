import {
  type AlignmentEdge,
  alignWidgets,
  distributeWidgets,
  wrapInShape,
  useDashboardEditorStore
} from '../dashboard-editor'
import { ScreenTabs } from './ScreenTabs'
import { DrillInCrumbs, SlotTabs } from './SlotTabs'

/**
 * Which screen or container is being worked on, and what can be done to the
 * selection. The view controls are not here: how the canvas is being looked at
 * and what a gesture sticks to sit in the status bar under it, because neither
 * is an edit.
 *
 * Alignment appears only once there is a selection to align, which is also when
 * it starts meaning anything.
 */
export function ArrangeToolbar(): React.JSX.Element {
  const selectedIds = useDashboardEditorStore((state) => state.selectedIds)
  const drillIn = useDashboardEditorStore((state) => state.drillIn)
  const distributable = selectedIds.length >= 3
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {/* Inside a slot the pages take the place of the screens: switching screens
          would leave the slot anyway, so offering both would be two ways to say
          one thing. */}
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
