import { isContainer, screenWidgetsOf } from '@shared/configuration-access'
import type { WidgetConfiguration } from '@shared/configuration-schema'
import type { DisplayDescriptor } from '@shared/device'
import { activeScreen, copyWidget, deleteWidget, duplicateWidget, findWidget, pasteWidget, parentContainerId, restackOrder, restackWidget, unwrapShape, useDashboardEditorStore, wrapInShape } from '../dashboard-editor'
import type { CanvasTool } from '../editor/store'
import { useSnapStore } from '../editor/snap-store'
import { useTemplatesStore } from '@/features/templates/templates-store'
import { useInsertScreenStore } from '@/features/templates/insert-screen-store'
import { createWidget, defaultToolBox } from './widget-creation'
import { useDeviceStore } from '@/features/device/device-store'
import { withEditGroup } from '@/features/device/edit-group'
import { t } from '@shared/ui-text'

export type MenuEntry =
  | { kind: 'item'; label: string; hint?: string; disabled?: boolean; run: () => void }
  | { kind: 'toggle'; label: string; checked: boolean; run: () => void }
  | { kind: 'submenu'; label: string; items: MenuEntry[] }
  | { kind: 'separator' }

const ADDABLE: { label: string; tool: Exclude<CanvasTool, 'select'> }[] = [
  { label: t('modules.effectEditor.text'), tool: 'text' },
  { label: t('inspector.indicatorEditor.shape'), tool: 'shape' },
  { label: t('inspector.gaugeEditors.bar'), tool: 'bar' },
  { label: t('inspector.gaugeEditors.arc'), tool: 'arc' },
  { label: t('canvas.toolPalette.lights'), tool: 'indicator' },
  { label: t('canvas.toolPalette.graph'), tool: 'graph' },
  { label: t('firmware.firmwarePage.image'), tool: 'image' },
  { label: t('canvas.toolPalette.slot'), tool: 'slot' },
  { label: t('canvas.toolPalette.tapZone'), tool: 'tap_zone' }
]

export function deleteSelection(ids: readonly string[]): void {
  if (ids.length === 0) return
  withEditGroup(() => {
    for (const id of ids) deleteWidget({ type: 'widget', id })
  })
  useDashboardEditorStore.getState().select(undefined)
}

export function widgetMenuEntries(
  widgetId: string,
  display: { width: number; height: number },
  options: { onRename?: () => void } = {}
): MenuEntry[] {
  const editor = useDashboardEditorStore.getState()
  const configuration = useDeviceStore.getState().draft
  const ids = editor.selectedIds.includes(widgetId) ? editor.selectedIds : [widgetId]
  const widget = findWidget(configuration, widgetId)?.widget
  const container = widget !== undefined && isContainer(widget)
  const unwrappable = widget?.type === 'shape' ? widgetId : parentContainerId(configuration, { type: 'widget', id: widgetId })
  const many = ids.length > 1
  const restack = (move: Parameters<typeof restackWidget>[1]): void => {
    withEditGroup(() => {
      for (const id of restackOrder(configuration, ids, move)) restackWidget(id, move)
    })
  }
  return [
    {
      kind: 'item',
      label: many ? `Duplicate ${ids.length} widgets` : 'Duplicate',
      hint: t('shortcuts.cmdCtrlD'),
      run: () => {
        withEditGroup(() => {
          const added = ids
            .map((id) => duplicateWidget({ type: 'widget', id }, display))
            .filter((entry): entry is { type: 'widget'; id: string } => entry?.type === 'widget')
          if (added.length > 0) editor.selectMany(added.map((entry) => entry.id))
        })
      }
    },
    {
      kind: 'item',
      label: t('canvas.menuEntries.copy'),
      hint: t('shortcuts.cmdCtrlC'),
      run: () => void copyWidget(configuration, { type: 'widget', id: widgetId })
    },
    {
      kind: 'item',
      label: t('canvas.menuEntries.paste'),
      hint: t('shortcuts.cmdCtrlV'),
      run: () => void pasteWidget(display).then((added) => added && editor.select(added))
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: many ? `Wrap ${ids.length} in a container` : 'Wrap in a container',
      hint: t('shortcuts.cmdCtrlG'),
      run: () => {
        const created = wrapInShape(ids)
        if (created) editor.select({ type: 'widget', id: created })
      }
    },
    {
      kind: 'item',
      label: t('canvas.menuEntries.unwrapTheContainer'),
      hint: t('shortcuts.shiftCmdCtrlG'),
      disabled: unwrappable === undefined,
      run: () => {
        if (!unwrappable) return
        const released = unwrapShape(unwrappable)
        if (released.length > 0) editor.selectMany(released)
      }
    },
    { kind: 'separator' },
    { kind: 'item', label: t('canvas.menuEntries.bringToFront'), hint: t('shortcuts.cmdCtrl'), run: () => restack('front') },
    { kind: 'item', label: t('canvas.menuEntries.bringForward'), run: () => restack('forward') },
    { kind: 'item', label: t('canvas.menuEntries.sendBackward'), run: () => restack('backward') },
    { kind: 'item', label: t('canvas.menuEntries.sendToBack'), hint: t('shortcuts.cmdCtrl'), run: () => restack('back') },
    { kind: 'separator' },
    {
      kind: 'toggle',
      label: t('canvas.menuEntries.locked'),
      checked: Boolean(editor.locked[widgetId]),
      run: () => {
        for (const id of ids) editor.toggleLocked(id)
      }
    },
    {
      kind: 'toggle',
      label: t('canvas.menuEntries.hiddenWhileEditing'),
      checked: Boolean(editor.hidden[widgetId]),
      run: () => {
        for (const id of ids) editor.toggleHidden(id)
      }
    },
    ...(container
      ? ([
          {
            kind: 'item',
            label: t('canvas.menuEntries.workInsideIt'),
            hint: t('shortcuts.doubleClick'),
            run: () => editor.setDrillIn(widgetId)
          }
        ] as MenuEntry[])
      : []),
    ...(options.onRename
      ? ([{ kind: 'item', label: t('canvas.menuEntries.rename'), run: options.onRename } as MenuEntry])
      : []),
    { kind: 'separator' },
    {
      kind: 'item',
      label: many ? `Delete ${ids.length} widgets` : 'Delete',
      hint: t('shortcuts.del'),
      run: () => deleteSelection(ids)
    }
  ]
}

export function screenMenuEntries(
  display: DisplayDescriptor,
  at: { x: number; y: number } | undefined
): MenuEntry[] {
  const editor = useDashboardEditorStore.getState()
  const snap = useSnapStore.getState()
  const widgets = useTemplatesStore.getState().library?.widgets ?? []
  const point = at ?? { x: display.width / 2, y: display.height / 2 }
  return [
    {
      kind: 'submenu',
      label: t('canvas.menuEntries.add'),
      items: ADDABLE.map(({ label, tool }) => ({
        kind: 'item' as const,
        label,
        run: () => {
          const added = createWidget(tool, display, {
            placement: defaultToolBox(tool, point, display)
          })
          if (added) editor.select(added)
        }
      }))
    },
    {
      kind: 'submenu',
      label: t('canvas.menuEntries.insertWidget'),
      items:
        widgets.length > 0
          ? widgets.map((entry) => ({
              kind: 'item' as const,
              label: entry.name,
              hint: t('canvas.menuEntries.widthHeight', { width: entry.width, height: entry.height }),
              run: () => editor.beginInsert({ widget: entry.widget, label: entry.name })
            }))
          : [{ kind: 'item' as const, label: t('canvas.menuEntries.theWidgetLibraryIsEmpty'), disabled: true, run: () => {} }]
    },
    {
      kind: 'item',
      label: t('canvas.menuEntries.insertScreen'),
      hint: t('canvas.menuEntries.fromASavedDashboard'),
      run: () => useInsertScreenStore.getState().openPicker()
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: t('canvas.menuEntries.paste'),
      hint: t('shortcuts.cmdCtrlV'),
      run: () => void pasteWidget(display).then((added) => added && editor.select(added))
    },
    {
      kind: 'item',
      label: t('canvas.menuEntries.selectAllOnThisScreen'),
      hint: t('shortcuts.cmdCtrlA'),
      run: () =>
        editor.selectMany(
          screenWidgetsOf(activeScreen(useDeviceStore.getState().draft))
            .map((widget: WidgetConfiguration) => widget.id)
            .filter((id): id is string => Boolean(id))
        )
    },
    { kind: 'separator' },
    {
      kind: 'toggle',
      label: t('canvas.menuEntries.snapToGrid'),
      checked: snap.snapToGrid,
      run: () => snap.setSnap({ snapToGrid: !snap.snapToGrid })
    },
    {
      kind: 'toggle',
      label: t('canvas.menuEntries.snapToWidgets'),
      checked: snap.snapToWidgets,
      run: () => snap.setSnap({ snapToWidgets: !snap.snapToWidgets })
    },
    {
      kind: 'toggle',
      label: t('canvas.menuEntries.snapToEqualGaps'),
      checked: snap.snapToSpacing,
      run: () => snap.setSnap({ snapToSpacing: !snap.snapToSpacing })
    },
    {
      kind: 'toggle',
      label: t('canvas.menuEntries.resizingScalesContents'),
      checked: snap.scaleContents,
      run: () => snap.toggleScaleContents()
    }
  ]
}
