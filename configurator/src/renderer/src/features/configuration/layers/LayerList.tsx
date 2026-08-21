import { Eye, EyeOff, Lock, LockOpen } from 'lucide-react'

import { useDeviceStore } from '@/features/device/device-store'
import { withEditGroup } from '@/features/device/edit-group'
import { isContainer, pagesOf, stackOrder, widgetsOf } from '@shared/configuration-access'
import type { WidgetConfiguration } from '@shared/configuration-schema'
import {
  type DropRelation,
  canMoveWidget,
  moveWidget,
  unwrapShape,
  useDashboardEditorStore
} from '../dashboard-editor'
import { dropOrder, type RowState } from './layer-row-state'
import { RenameField } from './RenameField'
import { SlotPages } from './SlotPages'

/**
 * One parent's stack. A row is three drop bands: its top and bottom restack
 * beside it, its middle moves the dragged widget inside it. The middle band only
 * exists where the move is legal — a container that would nest too deep, is
 * full, or is the dragged widget's own descendant offers two bands instead of
 * three, so no band is ever a drop that quietly does nothing.
 */
export function LayerList({
  widgets,
  ...rowState
}: { widgets: WidgetConfiguration[] } & RowState): React.JSX.Element {
  const { dragged, setDragged, renaming, setRenaming, dropTarget, setDropTarget, openMenu } =
    rowState
  const draft = useDeviceStore((state) => state.draft)
  const selectedIds = useDashboardEditorStore((state) => state.selectedIds)
  const select = useDashboardEditorStore((state) => state.select)
  const extendSelection = useDashboardEditorStore((state) => state.extendSelection)
  const locked = useDashboardEditorStore((state) => state.locked)
  const hidden = useDashboardEditorStore((state) => state.hidden)
  const collapsed = useDashboardEditorStore((state) => state.collapsed)
  const toggleLocked = useDashboardEditorStore((state) => state.toggleLocked)
  const toggleHidden = useDashboardEditorStore((state) => state.toggleHidden)
  const toggleCollapsed = useDashboardEditorStore((state) => state.toggleCollapsed)

  // Back to front is what z_index means, so the list reverses it.
  const topFirst = stackOrder(widgets)
    .map(({ widget }) => widget)
    .reverse()

  // Which band the pointer is over, or undefined when no drop is legal there.
  // Legal for every dragged row: a group that could only partly land would tear
  // the selection in half.
  const bandAt = (
    event: React.DragEvent<HTMLElement>,
    id: string,
    container: boolean
  ): DropRelation | undefined => {
    if (!dragged || dragged.length === 0) return undefined
    const box = event.currentTarget.getBoundingClientRect()
    const position = box.height > 0 ? (event.clientY - box.top) / box.height : 0.5
    const legal = (band: DropRelation): DropRelation | undefined =>
      dragged.every((entry) => canMoveWidget(entry, band, id)) ? band : undefined
    if (container && dragged.every((entry) => canMoveWidget(entry, 'inside', id))) {
      if (position < 0.25) return legal('above')
      if (position > 0.75) return legal('below')
      return 'inside'
    }
    return legal(position < 0.5 ? 'above' : 'below')
  }

  const applyDrop = (band: DropRelation, id: string): void => {
    if (!dragged) return
    withEditGroup(() => {
      for (const entry of dropOrder(draft, dragged, band)) moveWidget(entry, band, id)
    })
  }

  return (
    <>
      {topFirst.map((widget) => {
        const id = widget.id
        if (!id) return null
        const selected = selectedIds.includes(id)
        const children = widget.type === 'shape' ? widgetsOf(widget) : []
        const pages = widget.type === 'slot' ? pagesOf(widget) : []
        const holds = children.length > 0 || pages.length > 0
        const open = holds && !collapsed[id]
        const band = dropTarget?.id === id && dropTarget.page === undefined ? dropTarget.band : undefined
        return (
          <div key={id}>
          <div
            data-layer-id={id}
            draggable
            onContextMenu={(event) => openMenu(event, id)}
            onDragStart={(event) => {
              // Dragging a selected row drags the whole selection, the way
              // dragging one of several selected widgets moves the group on the
              // canvas; an unselected row travels alone.
              setDragged(selectedIds.includes(id) ? selectedIds : [id])
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(event) => {
              const over = bandAt(event, id, isContainer(widget))
              // Leaving preventDefault uncalled is what shows the no-drop cursor
              // and keeps onDrop from firing at all — the refusal costs nothing.
              if (!over) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              // Only on a change: dragover fires continuously, and writing state
              // every time would re-render the whole panel dozens of times a second.
              if (dropTarget?.id !== id || dropTarget.band !== over || dropTarget.page !== undefined) {
                setDropTarget({ id, band: over })
              }
            }}
            onDrop={(event) => {
              event.preventDefault()
              // Recomputed from the drop itself: the stored band is a render behind.
              const over = bandAt(event, id, isContainer(widget))
              if (over) applyDrop(over, id)
              setDragged(undefined)
              setDropTarget(undefined)
            }}
            onDragEnd={() => {
              setDragged(undefined)
              setDropTarget(undefined)
            }}
            className={`relative flex items-center gap-1 rounded-md border px-2 py-1 ${
              selected ? 'border-sky-500 bg-sky-500/10' : 'border-transparent hover:bg-muted'
            } ${dragged?.includes(id) ? 'opacity-50' : ''} ${
              band === 'inside' ? 'ring-2 ring-inset ring-sky-400' : ''
            }`}
          >
            {/* Absolute and click-through: an element under the cursor would
                swallow the dragover this indicator exists to reflect. */}
            {band === 'above' || band === 'below' ? (
              <span
                aria-hidden
                className={`pointer-events-none absolute inset-x-0 h-0.5 bg-sky-400 ${
                  band === 'above' ? '-top-px' : '-bottom-px'
                }`}
              />
            ) : null}
            <span
              className="cursor-grab text-muted-foreground"
              title="Drag to restack, or onto the middle of a container to move it inside"
            >
              ⠿
            </span>
            {/* A fixed-width slot whether or not there is a triangle, so the
                names stay in one column at every depth. */}
            <button
              type="button"
              aria-expanded={holds ? open : undefined}
              title={holds ? (open ? 'Fold' : 'Unfold') : undefined}
              disabled={!holds}
              className="w-3 flex-none text-muted-foreground hover:text-foreground disabled:opacity-0"
              onClick={() => toggleCollapsed(id)}
            >
              {holds ? (open ? '▾' : '▸') : '·'}
            </button>
            {renaming === id ? (
              <RenameField id={id} onDone={() => setRenaming(undefined)} />
            ) : (
              <button
                type="button"
                className={`min-w-0 flex-1 truncate text-left ${hidden[id] ? 'text-muted-foreground line-through' : ''}`}
                title={`${widget.type} · double-click to rename`}
                onClick={(event) =>
                  event.shiftKey ? extendSelection(id) : select({ type: 'widget', id })
                }
                onDoubleClick={() => setRenaming(id)}
              >
                {id}
              </button>
            )}
            <span className="flex-none text-muted-foreground">{widget.type}</span>
            {/* A slot's widgets belong to a page, so releasing them beside the
                slot would have to pick one and lose the rest. */}
            {widget.type === 'shape' && children.length > 0 ? (
              <button
                type="button"
                className="flex-none px-1 text-muted-foreground hover:text-foreground"
                title="Unwrap, putting the widgets back beside this one"
                onClick={() => {
                  const released = unwrapShape(id)
                  if (released.length > 0) {
                    useDashboardEditorStore.getState().selectMany(released)
                  }
                }}
              >
                ⤴
              </button>
            ) : null}
            {/* Drawn rather than typed: an emoji padlock is a colour bitmap at
                whatever weight the platform font gives it, which is the one
                thing in these rows that does not follow the text around it. The
                set state is the stronger colour, so a locked or hidden layer
                reads at a glance instead of on hover. */}
            <button
              type="button"
              className={`flex-none px-1 hover:text-foreground ${
                locked[id] ? 'text-foreground' : 'text-muted-foreground'
              }`}
              title={locked[id] ? 'Unlock' : 'Lock so the canvas cannot move it'}
              onClick={() => toggleLocked(id)}
            >
              {locked[id] ? (
                <Lock aria-hidden className="size-3" />
              ) : (
                <LockOpen aria-hidden className="size-3" />
              )}
            </button>
            <button
              type="button"
              className={`flex-none px-1 hover:text-foreground ${
                hidden[id] ? 'text-foreground' : 'text-muted-foreground'
              }`}
              title={hidden[id] ? 'Show in the editor' : 'Hide in the editor only'}
              onClick={() => toggleHidden(id)}
            >
              {hidden[id] ? (
                <EyeOff aria-hidden className="size-3" />
              ) : (
                <Eye aria-hidden className="size-3" />
              )}
            </button>
          </div>
            {open ? (
              <div className="ml-3 border-l border-violet-500/40 pl-1">
                {widget.type === 'slot' ? (
                  <SlotPages slot={widget} slotId={id} {...rowState} />
                ) : (
                  <LayerList widgets={children} {...rowState} />
                )}
              </div>
            ) : null}
          </div>
        )
      })}
    </>
  )
}
