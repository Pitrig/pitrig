import { Fragment } from 'react'
import { pagesOf, screenWidgetsOf, screensOf } from '@shared/configuration-access'
import type { SlotWidgetConfiguration } from '@shared/configuration-schema'
import {
  MAXIMUM_SLOT_PAGES,
  addSlotPage,
  ancestorsOf,
  findWidget,
  useDashboardEditorStore
} from '../dashboard-editor'
import { visibleSlotPage } from './canvas-geometry'
import { screenName } from './screen-name'
import { useDeviceStore } from '@/features/device/device-store'

/**
 * One picker per slot on the screen being edited. The board decides which page a
 * slot shows from a tap or a trigger, so this is purely a way to look at the
 * others while authoring them — and, while a slot is open, the tabs of the one
 * being edited stand where the screen tabs do.
 */
export function SlotTabs(): React.JSX.Element | null {
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
export function DrillInCrumbs(): React.JSX.Element | null {
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
        {`← ${screenName(screensOf(configuration), activeScreenIndex)}`}
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
