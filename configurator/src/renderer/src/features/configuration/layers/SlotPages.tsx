import { useDeviceStore } from '@/features/device/device-store'
import { withEditGroup } from '@/features/device/edit-group'
import { pagesOf, widgetsOf } from '@shared/configuration-access'
import type { SlotWidgetConfiguration } from '@shared/configuration-schema'
import { visibleSlotPage } from '../preview/canvas-geometry'
import { canMoveWidgetInto, moveWidgetInto, useDashboardEditorStore } from '../dashboard-editor'
import { LayerList } from './LayerList'
import { dropOrder } from './layer-row-state'
import type { RowState } from './layer-row-state'

/**
 * A slot's pages, each with the widgets on it. Every page is listed rather than
 * only the one the canvas draws, because a page nobody is looking at is still
 * authored — and dropping onto its row is the only way to put a widget there
 * without switching the canvas to it first.
 */
export function SlotPages({
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
