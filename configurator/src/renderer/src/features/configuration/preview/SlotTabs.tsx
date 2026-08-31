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
import { TOOLBAR_GHOST, TOOLBAR_ITEM, TOOLBAR_ITEM_ACTIVE, ToolbarDivider, ToolbarGroup } from './toolbar-parts'

export function SlotTabs(): React.JSX.Element | null {
  const configuration = useDeviceStore((state) => state.draft)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const slotPage = useDashboardEditorStore((state) => state.slotPage)
  const setSlotPage = useDashboardEditorStore((state) => state.setSlotPage)
  const drillIn = useDashboardEditorStore((state) => state.drillIn)
  const slots = screenWidgetsOf(screensOf(configuration)[activeScreenIndex]).filter(
    (widget): widget is SlotWidgetConfiguration => widget.type === 'slot'
  )
  const opened = drillIn ? openedChain(configuration, drillIn) : undefined
  const related = opened ? slots.filter((slot) => slot.id && opened.includes(slot.id)) : slots
  const shown = related.length > 0 ? related : slots
  if (shown.length === 0) return null
  return (
    <ToolbarGroup label="Slots">
      {shown.map((slot, position) => {
        const id = slot.id ?? ''
        const pages = pagesOf(slot)
        const current = visibleSlotPage(slot, slotPage)
        return (
          <div key={id} className="flex items-center gap-0.5">
            {position > 0 ? <ToolbarDivider /> : null}
            <span className="px-1 text-[11px] text-muted-foreground">{id}</span>
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
                className={`${TOOLBAR_ITEM} px-2 ${index === current ? TOOLBAR_ITEM_ACTIVE : ''}`}
                onClick={() => setSlotPage(id, index)}
              >
                {page.in_loop === false ? `${index + 1}*` : index + 1}
              </button>
            ))}
            {drillIn === id && pages.length < MAXIMUM_SLOT_PAGES ? (
              <button
                type="button"
                title="Add a page to this slot"
                className={TOOLBAR_GHOST}
                onClick={() => addSlotPage(id)}
              >
                +
              </button>
            ) : null}
          </div>
        )
      })}
    </ToolbarGroup>
  )
}

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

export function DrillInCrumbs(): React.JSX.Element | null {
  const configuration = useDeviceStore((state) => state.draft)
  const drillIn = useDashboardEditorStore((state) => state.drillIn)
  const setDrillIn = useDashboardEditorStore((state) => state.setDrillIn)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  if (!drillIn) return null
  const chain = openedChain(configuration, drillIn)
  return (
    <ToolbarGroup label="Inside">
      <button
        type="button"
        title="Leave every container (Escape)"
        className={`${TOOLBAR_ITEM} px-2`}
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
            className={`${TOOLBAR_ITEM} px-2 ${
              index === chain.length - 1 ? TOOLBAR_ITEM_ACTIVE : ''
            }`}
            onClick={() => setDrillIn(id)}
          >
            {id}
          </button>
        </Fragment>
      ))}
    </ToolbarGroup>
  )
}
