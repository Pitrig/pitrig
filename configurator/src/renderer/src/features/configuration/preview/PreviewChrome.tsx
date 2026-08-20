import { Fragment, useState } from 'react'
import { pagesOf, screenWidgetsOf, screensOf } from '@shared/configuration-access'
import { type SlotWidgetConfiguration } from '@shared/configuration-schema'
import { type DisplayDescriptor } from '@shared/device'
import { type AlignmentEdge, MAXIMUM_SCREENS, MAXIMUM_SLOT_PAGES, addScreen, addSlotPage, addTapZone, alignWidgets, ancestorsOf, deleteScreen, distributeWidgets, findWidget, moveScreen, wrapInShape, useDashboardEditorStore } from '../dashboard-editor'
import { visibleSlotPage } from './canvas-geometry'
import { useDeviceStore } from '@/features/device/device-store'

/**
 * Which screen is being authored, and in which order the driver swipes through
 * them. Which one is being looked at is an editor view with nothing to save;
 * the order is the document, so dragging a tab is an ordinary undoable edit.
 */
function ScreenTabs(): React.JSX.Element {
  const configuration = useDeviceStore((state) => state.draft)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const setActiveScreen = useDashboardEditorStore((state) => state.setActiveScreen)
  const [dragged, setDragged] = useState<number>()
  // Which edge of which tab the drop would land on. One object for the strip
  // rather than a flag per tab, as the layer list does it.
  const [dropTarget, setDropTarget] = useState<{ index: number; before: boolean }>()
  const screens = screensOf(configuration)
  const count = Math.max(screens.length, 1)
  // A single screen has no order to change, and a sparse document can show a
  // tab for a screen the array does not hold yet.
  const reorderable = screens.length > 1

  // Where the pointer sits on the tab, and what that means to an array the
  // dragged screen is spliced out of first: a landing spot after the one it
  // came from shifts back by one.
  const edgeAt = (event: React.DragEvent<HTMLElement>): boolean => {
    const box = event.currentTarget.getBoundingClientRect()
    return box.width > 0 ? event.clientX - box.left < box.width / 2 : true
  }
  const destinationOf = (from: number, index: number, before: boolean): number => {
    const at = before ? index : index + 1
    return at > from ? at - 1 : at
  }

  return (
    <>
      {Array.from({ length: count }, (_, index) => {
        const edge = dropTarget?.index === index ? dropTarget.before : undefined
        return (
        <button
          key={screens[index]?.id ?? index}
          type="button"
          draggable={reorderable}
          title={
            reorderable
              ? `Edit screen ${index + 1} · drag to reorder`
              : `Edit screen ${index + 1}`
          }
          aria-pressed={index === activeScreenIndex}
          className={`relative h-7 rounded-md border px-2 hover:bg-muted ${
            index === activeScreenIndex ? 'bg-muted font-medium' : ''
          } ${dragged === index ? 'opacity-50' : ''}`}
          onClick={() => setActiveScreen(index)}
          onDragStart={(event) => {
            setDragged(index)
            event.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(event) => {
            if (dragged === undefined) return
            const before = edgeAt(event)
            // A drop that would put the screen back where it started is not
            // offered at all, so no band is ever a move that does nothing.
            if (destinationOf(dragged, index, before) === dragged) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            if (dropTarget?.index !== index || dropTarget.before !== before) {
              setDropTarget({ index, before })
            }
          }}
          onDrop={(event) => {
            event.preventDefault()
            // Recomputed from the drop itself: the stored edge is a render behind.
            if (dragged !== undefined) {
              moveScreen(dragged, destinationOf(dragged, index, edgeAt(event)))
            }
            setDragged(undefined)
            setDropTarget(undefined)
          }}
          onDragEnd={() => {
            setDragged(undefined)
            setDropTarget(undefined)
          }}
          onDragLeave={() => {
            // Only if this tab is still the marked one. Leaving one tab and
            // entering the next fire in either order, and an unguarded clear
            // would wipe the indicator the tab being entered had just set.
            setDropTarget((current) => (current?.index === index ? undefined : current))
          }}
        >
          {/* Absolute and click-through, for the same reason the layer list's
              indicator is: an element under the cursor would swallow the
              dragover this exists to reflect. */}
          {edge !== undefined ? (
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-y-0 w-0.5 bg-sky-400 ${
                edge ? '-left-px' : '-right-px'
              }`}
            />
          ) : null}
          {index + 1}
        </button>
        )
      })}
      {count < MAXIMUM_SCREENS ? (
        <button
          type="button"
          title="Add a screen"
          className="h-7 rounded-md border px-2 hover:bg-muted"
          onClick={() => {
            const index = addScreen()
            if (index !== undefined) setActiveScreen(index)
          }}
        >
          +
        </button>
      ) : null}
      {activeScreenIndex > 0 ? (
        <button
          type="button"
          title="Delete this screen and everything on it"
          className="h-7 rounded-md border px-2 hover:bg-muted"
          onClick={() => deleteScreen(activeScreenIndex)}
        >
          −
        </button>
      ) : null}
    </>
  )
}

/**
 * One picker per slot on the screen being edited. The board decides which page a
 * slot shows from a tap or a trigger, so this is purely a way to look at the
 * others while authoring them — and, while a slot is open, the tabs of the one
 * being edited stand where the screen tabs do.
 */
function SlotTabs(): React.JSX.Element | null {
  const configuration = useDeviceStore((state) => state.draft)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const slotPage = useDashboardEditorStore((state) => state.slotPage)
  const setSlotPage = useDashboardEditorStore((state) => state.setSlotPage)
  const drillIn = useDashboardEditorStore((state) => state.drillIn)
  // A slot is authored on a screen, but the sweep is over the whole screen
  // anyway: it costs nothing and it does not depend on where a slot may sit.
  const slots = screenWidgetsOf(screensOf(configuration)[activeScreenIndex]).filter(
    (widget): widget is SlotWidgetConfiguration => widget.type === 'slot'
  )
  // Inside a container, only the slot that container belongs to has pages worth
  // switching — and a shape that belongs to no slot leaves every slot's tabs
  // where they were, because none of them is the thing being edited.
  const opened = drillIn ? openedChain(configuration, drillIn) : undefined
  const related = opened ? slots.filter((slot) => slot.id && opened.includes(slot.id)) : slots
  const shown = related.length > 0 ? related : slots
  if (shown.length === 0) return null
  return (
    <>
      {shown.map((slot) => {
        const id = slot.id ?? ''
        const pages = pagesOf(slot)
        const current = visibleSlotPage(slot, slotPage)
        return (
          <div key={id} className="flex items-center gap-1">
            <span className="text-muted-foreground">{id}</span>
            {pages.map((page, index) => (
              <button
                key={index}
                type="button"
                title={
                  page.trigger && page.trigger !== 'none'
                    ? `Page ${index + 1}, shown by ${page.source?.binding || 'telemetry'}`
                    : `Page ${index + 1}`
                }
                aria-pressed={index === current}
                className={`h-7 rounded-md border px-2 hover:bg-muted ${
                  index === current ? 'bg-muted font-medium' : ''
                }`}
                onClick={() => setSlotPage(id, index)}
              >
                {/* A page reached only by a trigger is not part of the loop, and
                    saying so here is what makes the tap order readable. */}
                {page.in_loop === false ? `${index + 1}*` : index + 1}
              </button>
            ))}
            {drillIn === id && pages.length < MAXIMUM_SLOT_PAGES ? (
              <button
                type="button"
                title="Add a page to this slot"
                className="h-7 rounded-md border px-2 hover:bg-muted"
                onClick={() => addSlotPage(id)}
              >
                +
              </button>
            ) : null}
          </div>
        )
      })}
    </>
  )
}

/**
 * The containers between the screen and the one being worked in, outermost
 * first. One walk, so the crumbs and the slot tabs agree on what is open.
 */
function openedChain(
  configuration: ReturnType<typeof useDeviceStore.getState>['draft'],
  containerId: string
): string[] {
  const location = findWidget(configuration, containerId)
  if (!location) return [containerId]
  return [...ancestorsOf(configuration, location), location.widget]
    .map((widget) => widget.id)
    .filter((id): id is string => id !== undefined)
}

/**
 * Where in the document the canvas is looking, and the way back out. A crumb
 * per container rather than one button, because containers nest: leaving the
 * innermost one is a step, not the way back to the screen.
 */
function DrillInCrumbs(): React.JSX.Element | null {
  const configuration = useDeviceStore((state) => state.draft)
  const drillIn = useDashboardEditorStore((state) => state.drillIn)
  const setDrillIn = useDashboardEditorStore((state) => state.setDrillIn)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  if (!drillIn) return null
  const chain = openedChain(configuration, drillIn)
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title="Leave every container (Escape)"
        className="h-7 rounded-md border px-2 hover:bg-muted"
        onClick={() => setDrillIn(undefined)}
      >
        {`← Screen ${activeScreenIndex + 1}`}
      </button>
      {chain.map((id, index) => (
        <Fragment key={id}>
          <span className="text-muted-foreground">›</span>
          <button
            type="button"
            title={`Work inside ${id}`}
            aria-pressed={index === chain.length - 1}
            className={`h-7 rounded-md border px-2 hover:bg-muted ${
              index === chain.length - 1 ? 'bg-muted font-medium' : ''
            }`}
            onClick={() => setDrillIn(id)}
          >
            {id}
          </button>
        </Fragment>
      ))}
    </div>
  )
}

/**
 * Arrangement acts on the selection and the view controls act on the canvas, so
 * neither belongs with the buttons that add widgets. Alignment appears only
 * once there is a selection to align, which is also when it starts meaning
 * anything.
 */
export function ArrangeToolbar({ display }: { display: DisplayDescriptor }): React.JSX.Element {
  const selectedIds = useDashboardEditorStore((state) => state.selectedIds)
  const view = useDashboardEditorStore((state) => state.view)
  const setView = useDashboardEditorStore((state) => state.setView)
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
      <button
        type="button"
        title="Add an invisible rectangle that takes a tap"
        className="h-7 rounded-md border px-2 hover:bg-muted"
        onClick={() => {
          const id = addTapZone(display)
          if (id) useDashboardEditorStore.getState().select({ type: 'widget', id })
        }}
      >
        Tap zone
      </button>
      <span className="mx-1 h-4 w-px bg-border" />
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
          <span className="mx-1 h-4 w-px bg-border" />
        </>
      ) : null}
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={view.snapToGrid} onChange={(event) => setView({ snapToGrid: event.target.checked })} />
        Grid
      </label>
      <input
        aria-label="Grid size"
        type="number"
        min={1}
        max={64}
        value={view.gridSize}
        disabled={!view.snapToGrid}
        className="h-7 w-14 rounded-md border bg-transparent px-1 disabled:opacity-40"
        onChange={(event) => setView({ gridSize: Math.max(1, Math.round(Number(event.target.value) || 1)) })}
      />
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
