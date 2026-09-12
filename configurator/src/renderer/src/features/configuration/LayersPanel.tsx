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
import { t } from '@shared/ui-text'

export function LayersPanel(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const selectedIds = useDashboardEditorStore((state) => state.selectedIds)
  const selection = useDashboardEditorStore((state) => state.selection)
  const [dragged, setDragged] = useState<Dragged>()
  const [renaming, setRenaming] = useState<string>()
  const [dropTarget, setDropTarget] = useState<DropTarget>()
  const [menu, setMenu] = useState<{ x: number; y: number; id: string }>()
  const body = useRef<HTMLDivElement>(null)

  const screen = screensOf(draft)[activeScreenIndex]
  const widgets = widgetsOf(screen)

  const primary = selection?.type === 'widget' ? selection.id : undefined
  useEffect(() => {
    if (!primary) return
    const configuration = useDeviceStore.getState().draft
    const location = findWidget(configuration, primary)
    if (location) {
      useDashboardEditorStore.getState().expand(
        ancestorsOf(configuration, location)
          .map((ancestor) => ancestor.id)
          .filter((id): id is string => id !== undefined)
      )
    }
    const frame = requestAnimationFrame(() => {
      body.current
        ?.querySelector(`[data-layer-id="${CSS.escape(primary)}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [primary])

  const openMenu = (event: React.MouseEvent, id: string): void => {
    event.preventDefault()
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
          <CardTitle>{t('modules.effectList.layers')}</CardTitle>
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
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDropTarget(undefined)
            }
          }}
        >
          {widgets.length === 0 ? (
            <p className="text-muted-foreground">{t('dashboard.layersPanel.noWidgetsYet')}</p>
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
            {t('dashboard.layersPanel.hidingAndLockingApplyTo')}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

const STACK_BUTTONS: { move: StackMove; label: string; title: string }[] = [
  { move: 'front', label: '⤒', title: t('dashboard.layersPanel.bringToFrontCmdCtrl') },
  { move: 'forward', label: '↑', title: t('dashboard.layersPanel.bringForwardAltCmdCtrl') },
  { move: 'backward', label: '↓', title: t('dashboard.layersPanel.sendBackwardAltCmdCtrl') },
  { move: 'back', label: '⤓', title: t('dashboard.layersPanel.sendToBackCmdCtrl') }
]
