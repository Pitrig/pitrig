import { useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDeviceStore } from '@/features/device/device-store'
import { widgetsOf } from '../../../../shared/configuration-access'
import { WIDGET_ID_CAPACITY } from '../../../../shared/configuration-schema'
import {
  activeScreen,
  renameWidget,
  reorderWidgets,
  useDashboardEditorStore
} from './dashboard-editor'

// The stack, top layer first — the order things are drawn in, read the way they
// are looked at. Reordering rewrites `z_index`; locking and hiding are editor
// state and never reach the document, because the device would reject the
// unknown properties and a hidden layer is not a hidden widget.
export function LayersPanel(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const selectedIds = useDashboardEditorStore((state) => state.selectedIds)
  const select = useDashboardEditorStore((state) => state.select)
  const extendSelection = useDashboardEditorStore((state) => state.extendSelection)
  const locked = useDashboardEditorStore((state) => state.locked)
  const hidden = useDashboardEditorStore((state) => state.hidden)
  const toggleLocked = useDashboardEditorStore((state) => state.toggleLocked)
  const toggleHidden = useDashboardEditorStore((state) => state.toggleHidden)
  const [dragged, setDragged] = useState<string>()
  const [renaming, setRenaming] = useState<string>()

  const widgets = widgetsOf(activeScreen(draft))
  // Back to front is what z_index means, so the list reverses it.
  const stack = [...widgets]
    .map((widget, order) => ({ widget, order }))
    .sort(
      (left, right) =>
        (left.widget.z_index ?? 0) - (right.widget.z_index ?? 0) || left.order - right.order
    )
  const backToFront = stack.map(({ widget }) => widget)
  const topFirst = [...backToFront].reverse()

  const dropOn = (targetId: string): void => {
    if (!dragged || dragged === targetId) return
    const order = backToFront.map((widget) => widget.id).filter((id): id is string => Boolean(id))
    const from = order.indexOf(dragged)
    const to = order.indexOf(targetId)
    if (from < 0 || to < 0) return
    order.splice(to, 0, ...order.splice(from, 1))
    reorderWidgets(order)
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle>Layers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-3 pb-3 text-xs">
        {topFirst.length === 0 ? (
          <p className="text-muted-foreground">No widgets yet.</p>
        ) : null}
        {topFirst.map((widget) => {
          const id = widget.id
          if (!id) return null
          const selected = selectedIds.includes(id)
          return (
            <div
              key={id}
              draggable
              onDragStart={() => setDragged(id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                dropOn(id)
                setDragged(undefined)
              }}
              onDragEnd={() => setDragged(undefined)}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 ${
                selected ? 'border-sky-500 bg-sky-500/10' : 'border-transparent hover:bg-muted'
              } ${dragged === id ? 'opacity-50' : ''}`}
            >
              <span className="cursor-grab text-muted-foreground" title="Drag to restack">
                ⠿
              </span>
              {renaming === id ? (
                <RenameField
                  id={id}
                  onDone={() => setRenaming(undefined)}
                />
              ) : (
                <button
                  type="button"
                  className={`min-w-0 flex-1 truncate text-left ${hidden[id] ? 'text-muted-foreground line-through' : ''}`}
                  title={`${widget.type} · double-click to rename`}
                  onClick={(event) => (event.shiftKey ? extendSelection(id) : select({ type: 'widget', id }))}
                  onDoubleClick={() => setRenaming(id)}
                >
                  {id}
                </button>
              )}
              <span className="flex-none text-muted-foreground">{widget.type}</span>
              <button
                type="button"
                className="flex-none px-1 text-muted-foreground hover:text-foreground"
                title={locked[id] ? 'Unlock' : 'Lock so the canvas cannot move it'}
                onClick={() => toggleLocked(id)}
              >
                {locked[id] ? '🔒' : '🔓'}
              </button>
              <button
                type="button"
                className="flex-none px-1 text-muted-foreground hover:text-foreground"
                title={hidden[id] ? 'Show in the editor' : 'Hide in the editor only'}
                onClick={() => toggleHidden(id)}
              >
                {hidden[id] ? '🙈' : '👁'}
              </button>
            </div>
          )
        })}
        {topFirst.length > 0 ? (
          <p className="pt-1 text-muted-foreground">
            Hiding and locking apply to this editing session only; the board draws every widget.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * A layer's name is its `id`, which the device stores but never draws — unlike
 * the caption. A rename that would collide or overflow is refused, so the
 * document stays one the board accepts.
 */
function RenameField({ id, onDone }: { id: string; onDone: () => void }): React.JSX.Element {
  const [value, setValue] = useState(id)
  const [rejected, setRejected] = useState(false)
  const commit = (): void => {
    // A refused rename keeps the field open with the old name back, so the
    // reason is visible rather than the edit silently vanishing.
    if (value !== id && !renameWidget(id, value)) {
      setRejected(true)
      setValue(id)
      return
    }
    onDone()
  }
  return (
    <input
      autoFocus
      value={value}
      maxLength={WIDGET_ID_CAPACITY - 1}
      className={`min-w-0 flex-1 rounded-md border bg-transparent px-1 ${rejected ? 'border-red-500' : ''}`}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') onDone()
      }}
    />
  )
}
