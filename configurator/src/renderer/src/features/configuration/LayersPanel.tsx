import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Lock, LockOpen } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDeviceStore } from '@/features/device/device-store'
import { withEditGroup } from '@/features/device/edit-group'
import { isContainer, pagesOf, screensOf, stackOrder, widgetsOf } from '@shared/configuration-access'
import { BOARD_PROFILES } from '@shared/device'
import { visibleSlotPage } from './preview/canvas-geometry'
import { ContextMenu } from './preview/ContextMenu'
import { widgetMenuEntries } from './preview/menu-entries'
import { WIDGET_ID_CAPACITY } from '@shared/configuration-schema'
import type { SlotWidgetConfiguration, WidgetConfiguration } from '@shared/configuration-schema'
import {
  type DropRelation,
  type StackMove,
  ancestorsOf,
  canMoveWidget,
  canMoveWidgetInto,
  findWidget,
  moveWidget,
  moveWidgetInto,
  renameWidget,
  restackOrder,
  restackWidget,
  stackRankOf,
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
// moves the widget into it; the top and bottom of a row restack beside it. A
// slot lists its pages, because a page is an array of its own and dropping onto
// one is the only way to reach a page the canvas is not showing.

/** What is being dragged: one row, or the whole selection when the row is in it. */
type Dragged = string[]

interface DropTarget {
  id: string
  band: DropRelation
  /** Set when the row is a slot page rather than a widget. */
  page?: number
}

export function LayersPanel(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const selectedIds = useDashboardEditorStore((state) => state.selectedIds)
  const selection = useDashboardEditorStore((state) => state.selection)
  const expand = useDashboardEditorStore((state) => state.expand)
  const [dragged, setDragged] = useState<Dragged>()
  const [renaming, setRenaming] = useState<string>()
  // Where the drop would land, so the row can show it. One object at panel level
  // rather than a flag per row: there is only ever one, and clearing it is then
  // one assignment instead of every row racing to unset its own.
  const [dropTarget, setDropTarget] = useState<DropTarget>()
  // The same menu the canvas opens, from the row instead of from the widget.
  const [menu, setMenu] = useState<{ x: number; y: number; id: string }>()
  const body = useRef<HTMLDivElement>(null)

  // Read through the subscribed index rather than the store getter, so the list
  // re-renders when the screen being edited changes.
  const screen = screensOf(draft)[activeScreenIndex]
  const widgets = widgetsOf(screen)

  // A widget picked on the canvas has to be findable here, and it is not
  // findable inside a folded container. Opening its ancestors and scrolling to
  // it is what makes the two views one view.
  const primary = selection?.type === 'widget' ? selection.id : undefined
  useEffect(() => {
    if (!primary) return
    const location = findWidget(draft, primary)
    if (location) {
      expand(
        ancestorsOf(draft, location)
          .map((ancestor) => ancestor.id)
          .filter((id): id is string => id !== undefined)
      )
    }
    // After the expansion has rendered, or the row is not in the DOM yet.
    const frame = requestAnimationFrame(() => {
      body.current
        ?.querySelector(`[data-layer-id="${CSS.escape(primary)}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [primary, draft, expand])

  const openMenu = (event: React.MouseEvent, id: string): void => {
    event.preventDefault()
    // A menu acts on the selection, so a right-click on an unselected row picks
    // it first — otherwise "Delete" would delete something else.
    if (!selectedIds.includes(id)) {
      useDashboardEditorStore.getState().select({ type: 'widget', id })
    }
    setMenu({ x: event.clientX, y: event.clientY, id })
  }

  const rowProps = {
    dragged,
    setDragged,
    renaming,
    setRenaming,
    dropTarget,
    setDropTarget,
    openMenu
  }
  const display = draft ? BOARD_PROFILES[draft.board]?.display : undefined

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="flex-none py-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Layers</CardTitle>
          <div className="flex items-center gap-1 text-xs">
            {STACK_BUTTONS.map(({ move, label, title }) => (
              <button
                key={move}
                type="button"
                title={title}
                disabled={selectedIds.length === 0}
                className="h-6 rounded-md border px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                onClick={() =>
                  withEditGroup(() => {
                    for (const id of restackOrder(draft, selectedIds, move)) {
                      restackWidget(id, move)
                    }
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-3 pb-3 text-xs">
        <div
          ref={body}
          className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain"
          // One handler for the whole panel: a per-row dragleave fires on every
          // hop between a row's own buttons, which flickers the indicator
          // constantly.
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
        </div>
        {menu && display ? (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            entries={widgetMenuEntries(menu.id, display, {
              onRename: () => setRenaming(menu.id)
            })}
            onClose={() => setMenu(undefined)}
          />
        ) : null}
        {widgets.length > 0 ? (
          <p className="pt-1 text-muted-foreground">
            Hiding and locking apply to this editing session only; the board draws every widget.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

const STACK_BUTTONS: { move: StackMove; label: string; title: string }[] = [
  { move: 'front', label: '⤒', title: 'Bring to front (Cmd/Ctrl+])' },
  { move: 'forward', label: '↑', title: 'Bring forward (Alt+Cmd/Ctrl+])' },
  { move: 'backward', label: '↓', title: 'Send backward (Alt+Cmd/Ctrl+[)' },
  { move: 'back', label: '⤓', title: 'Send to back (Cmd/Ctrl+[)' }
]

interface RowState {
  dragged?: Dragged
  setDragged: (dragged?: Dragged) => void
  renaming?: string
  setRenaming: (id?: string) => void
  dropTarget?: DropTarget
  setDropTarget: (target?: DropTarget) => void
  /** Where the right button was pressed, and on which row. */
  openMenu: (event: React.MouseEvent, id: string) => void
}

/**
 * The order a dragged group has to be applied in to land arranged as it was.
 * Each move puts its widget directly at the anchor, so whichever is applied
 * last ends up nearest it: above a row that is the bottom of the group, and
 * below it or inside a container that is the top.
 */
function dropOrder(
  draft: ReturnType<typeof useDeviceStore.getState>['draft'],
  ids: readonly string[],
  band: DropRelation
): string[] {
  const ascending = [...ids].sort(
    (left, right) => stackRankOf(draft, left) - stackRankOf(draft, right)
  )
  return band === 'above' ? ascending.reverse() : ascending
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

/**
 * A slot's pages, each with the widgets on it. Every page is listed rather than
 * only the one the canvas draws, because a page nobody is looking at is still
 * authored — and dropping onto its row is the only way to put a widget there
 * without switching the canvas to it first.
 */
function SlotPages({
  slot,
  slotId,
  ...rowState
}: { slot: SlotWidgetConfiguration; slotId: string } & RowState): React.JSX.Element {
  const { dragged, setDragged, dropTarget, setDropTarget } = rowState
  const draft = useDeviceStore((state) => state.draft)
  const slotPage = useDashboardEditorStore((state) => state.slotPage)
  const setSlotPage = useDashboardEditorStore((state) => state.setSlotPage)
  const visible = visibleSlotPage(slot, slotPage)
  return (
    <>
      {pagesOf(slot).map((page, index) => {
        const droppable =
          dragged !== undefined &&
          dragged.length > 0 &&
          dragged.every((entry) => canMoveWidgetInto(entry, slotId, index))
        const over = dropTarget?.id === slotId && dropTarget.page === index
        return (
          <div key={index}>
            <div
              onDragOver={(event) => {
                if (!droppable) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                if (!over) setDropTarget({ id: slotId, band: 'inside', page: index })
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragged && droppable) {
                  withEditGroup(() => {
                    for (const entry of dropOrder(draft, dragged, 'inside')) {
                      moveWidgetInto(entry, slotId, index)
                    }
                  })
                  // A page the tabs are not looking at is not drawn, so the
                  // canvas is pointed at what just landed.
                  setSlotPage(slotId, index)
                }
                setDragged(undefined)
                setDropTarget(undefined)
              }}
              className={`flex items-center gap-1 rounded-md px-1 ${
                over ? 'ring-2 ring-inset ring-sky-400' : ''
              }`}
            >
              <button
                type="button"
                aria-pressed={index === visible}
                title="Draw this page on the canvas"
                className={`min-w-0 flex-1 truncate text-left ${
                  index === visible ? 'font-medium' : 'text-muted-foreground'
                }`}
                onClick={() => setSlotPage(slotId, index)}
              >
                {/* A page reached only by a trigger is not part of the loop, and
                    saying so here is what makes the tap order readable. */}
                {page.in_loop === false ? `Page ${index + 1}*` : `Page ${index + 1}`}
              </button>
            </div>
            <div className="ml-3 border-l border-sky-500/30 pl-1">
              <LayerList widgets={widgetsOf(page)} {...rowState} />
            </div>
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
