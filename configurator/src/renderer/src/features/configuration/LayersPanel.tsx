import { useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDeviceStore } from '@/features/device/device-store'
import { pagesOf, screensOf, stackOrder, widgetsOf } from '../../../../shared/configuration-access'
import { visibleSlotPage } from './preview/canvas-geometry'
import { WIDGET_ID_CAPACITY } from '../../../../shared/configuration-schema'
import type { WidgetConfiguration } from '../../../../shared/configuration-schema'
import {
  type DropRelation,
  canMoveWidget,
  moveWidget,
  renameWidget,
  unwrapShape,
  useDashboardEditorStore
} from './dashboard-editor'

// The stack, top layer first — the order things are drawn in, read the way they
// are looked at. Locking and hiding are editor state and never reach the
// document, because the device would reject the unknown properties and a hidden
// layer is not a hidden widget.
//
// A container is a parent on the device as well as in the list, so its children
// are stacked within it. Dragging a row onto the middle of a container's row
// moves the widget into it; the top and bottom of a row restack beside it.
export function LayersPanel(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const [dragged, setDragged] = useState<string>()
  const [renaming, setRenaming] = useState<string>()
  // Where the drop would land, so the row can show it. One object at panel level
  // rather than a flag per row: there is only ever one, and clearing it is then
  // one assignment instead of every row racing to unset its own.
  const [dropTarget, setDropTarget] = useState<{ id: string; band: DropRelation }>()

  // Read through the subscribed index rather than the store getter, so the list
  // re-renders when the screen being edited changes.
  const screen = screensOf(draft)[activeScreenIndex]
  const widgets = widgetsOf(screen)

  const rowProps = { dragged, setDragged, renaming, setRenaming, dropTarget, setDropTarget }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle>Layers</CardTitle>
      </CardHeader>
      <CardContent
        className="space-y-1 px-3 pb-3 text-xs"
        // One handler for the whole panel: a per-row dragleave fires on every hop
        // between a row's own buttons, which flickers the indicator constantly.
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDropTarget(undefined)
          }
        }}
      >
        {widgets.length === 0 ? (
          <p className="text-muted-foreground">No widgets yet.</p>
        ) : null}
        <LayerList widgets={widgets} {...rowProps} />
        {widgets.length > 0 ? (
          <p className="pt-1 text-muted-foreground">
            Hiding and locking apply to this editing session only; the board draws every widget.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

interface RowState {
  dragged?: string
  setDragged: (id?: string) => void
  renaming?: string
  setRenaming: (id?: string) => void
  dropTarget?: { id: string; band: DropRelation }
  setDropTarget: (target?: { id: string; band: DropRelation }) => void
}

/**
 * One parent's stack. A row is three drop bands: its top and bottom restack
 * beside it, its middle moves the dragged widget inside it. The middle band only
 * exists where the move is legal — a container that would nest too deep, is
 * full, or is the dragged widget's own descendant offers two bands instead of
 * three, so no band is ever a drop that quietly does nothing.
 */
function LayerList({
  widgets,
  ...rowState
}: { widgets: WidgetConfiguration[] } & RowState): React.JSX.Element {
  const { dragged, setDragged, renaming, setRenaming, dropTarget, setDropTarget } = rowState
  const selectedIds = useDashboardEditorStore((state) => state.selectedIds)
  const select = useDashboardEditorStore((state) => state.select)
  const extendSelection = useDashboardEditorStore((state) => state.extendSelection)
  const locked = useDashboardEditorStore((state) => state.locked)
  const hidden = useDashboardEditorStore((state) => state.hidden)
  const toggleLocked = useDashboardEditorStore((state) => state.toggleLocked)
  const toggleHidden = useDashboardEditorStore((state) => state.toggleHidden)
  const slotPage = useDashboardEditorStore((state) => state.slotPage)

  // Back to front is what z_index means, so the list reverses it.
  const topFirst = stackOrder(widgets)
    .map(({ widget }) => widget)
    .reverse()

  // Which band the pointer is over, or undefined when no drop is legal there.
  const bandAt = (
    event: React.DragEvent<HTMLElement>,
    id: string,
    isContainer: boolean
  ): DropRelation | undefined => {
    if (!dragged) return undefined
    const box = event.currentTarget.getBoundingClientRect()
    const position = box.height > 0 ? (event.clientY - box.top) / box.height : 0.5
    const legal = (band: DropRelation): DropRelation | undefined =>
      canMoveWidget(dragged, band, id) ? band : undefined
    if (isContainer && canMoveWidget(dragged, 'inside', id)) {
      if (position < 0.25) return legal('above')
      if (position > 0.75) return legal('below')
      return 'inside'
    }
    return legal(position < 0.5 ? 'above' : 'below')
  }

  return (
    <>
      {topFirst.map((widget) => {
        const id = widget.id
        if (!id) return null
        const selected = selectedIds.includes(id)
        // A container is a widget, so its contents are the same list nested
        // rather than a second kind of entry. A slot holds its widgets on a
        // page, so the list shows the page the tabs are looking at — the same
        // one the canvas draws and a drop lands on.
        const page = widget.type === 'slot' ? visibleSlotPage(widget, slotPage) : undefined
        const children =
          widget.type === 'shape'
            ? widgetsOf(widget)
            : widget.type === 'slot'
              ? widgetsOf(pagesOf(widget)[page ?? 0])
              : []
        const band = dropTarget?.id === id ? dropTarget.band : undefined
        return (
          <div key={id}>
          <div
            draggable
            onDragStart={(event) => {
              setDragged(id)
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(event) => {
              const over = bandAt(event, id, widget.type === 'shape' || widget.type === 'slot')
              // Leaving preventDefault uncalled is what shows the no-drop cursor
              // and keeps onDrop from firing at all — the refusal costs nothing.
              if (!over) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              // Only on a change: dragover fires continuously, and writing state
              // every time would re-render the whole panel dozens of times a second.
              if (dropTarget?.id !== id || dropTarget.band !== over) {
                setDropTarget({ id, band: over })
              }
            }}
            onDrop={(event) => {
              event.preventDefault()
              // Recomputed from the drop itself: the stored band is a render behind.
              const over = bandAt(event, id, widget.type === 'shape' || widget.type === 'slot')
              if (dragged && over) moveWidget(dragged, over, id)
              setDragged(undefined)
              setDropTarget(undefined)
            }}
            onDragEnd={() => {
              setDragged(undefined)
              setDropTarget(undefined)
            }}
            className={`relative flex items-center gap-1 rounded-md border px-2 py-1 ${
              selected ? 'border-sky-500 bg-sky-500/10' : 'border-transparent hover:bg-muted'
            } ${dragged === id ? 'opacity-50' : ''} ${
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
            {children.length > 0 ? (
              <div className="ml-3 border-l border-violet-500/40 pl-1">
                <div className="flex items-center gap-1 px-1 text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">
                    {page === undefined
                      ? `${children.length} inside`
                      : `${children.length} on page ${page + 1}`}
                  </span>
                  {/* A slot's widgets belong to a page, so releasing them beside
                      the slot would have to pick one and lose the rest. */}
                  {widget.type === 'shape' ? (
                    <button
                      type="button"
                      className="flex-none px-1 hover:text-foreground"
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
                </div>
                <LayerList widgets={children} {...rowState} />
              </div>
            ) : null}
          </div>
        )
      })}
    </>
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
