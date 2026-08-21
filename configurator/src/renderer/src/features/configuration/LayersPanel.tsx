import { useEffect, useRef, useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDeviceStore } from '@/features/device/device-store'
import { withEditGroup } from '@/features/device/edit-group'
import { screensOf, widgetsOf } from '@shared/configuration-access'
import { BOARD_PROFILES } from '@shared/device'
import { ContextMenu } from './preview/ContextMenu'
import { widgetMenuEntries } from './preview/menu-entries'
import {
  type StackMove,
  ancestorsOf,
  findWidget,
  restackOrder,
  restackWidget,
  useDashboardEditorStore
} from './dashboard-editor'
import { LayerList } from './layers/LayerList'
import type { Dragged, DropTarget } from './layers/layer-row-state'

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
