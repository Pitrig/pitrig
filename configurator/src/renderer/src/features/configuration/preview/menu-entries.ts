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

// What the right button offers, over the canvas and over the layer list.
//
// Separate from the component that draws it so that file exports components
// only, which is what lets fast refresh swap the menu without reloading the
// editor — the same reason the preview's geometry lives beside its renderers
// rather than inside them.

export type MenuEntry =
  | { kind: 'item'; label: string; hint?: string; disabled?: boolean; run: () => void }
  | { kind: 'toggle'; label: string; checked: boolean; run: () => void }
  | { kind: 'submenu'; label: string; items: MenuEntry[] }
  | { kind: 'separator' }

const ADDABLE: { label: string; tool: Exclude<CanvasTool, 'select'> }[] = [
  { label: 'Text', tool: 'text' },
  { label: 'Shape', tool: 'shape' },
  { label: 'Bar', tool: 'bar' },
  { label: 'Arc', tool: 'arc' },
  { label: 'Lights', tool: 'indicator' },
  { label: 'Graph', tool: 'graph' },
  { label: 'Image', tool: 'image' },
  { label: 'Slot', tool: 'slot' },
  { label: 'Tap zone', tool: 'tap_zone' }
]

/** Deleting a selection is one edit, the way the Delete key already makes it one. */
export function deleteSelection(ids: readonly string[]): void {
  if (ids.length === 0) return
  withEditGroup(() => {
    for (const id of ids) deleteWidget({ type: 'widget', id })
  })
  useDashboardEditorStore.getState().select(undefined)
}

/**
 * What can be done to whatever is selected. Shared by the canvas and the layer
 * list, because "duplicate, restack, lock, delete" is the same list of verbs
 * wherever the pointer happens to be — only renaming differs, which the layer
 * list can do inline and the canvas cannot.
 */
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
      hint: 'Cmd/Ctrl+D',
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
      label: 'Copy',
      hint: 'Cmd/Ctrl+C',
      run: () => void copyWidget(configuration, { type: 'widget', id: widgetId })
    },
    {
      kind: 'item',
      label: 'Paste',
      hint: 'Cmd/Ctrl+V',
      run: () => void pasteWidget(display).then((added) => added && editor.select(added))
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: many ? `Wrap ${ids.length} in a container` : 'Wrap in a container',
      hint: 'Cmd/Ctrl+G',
      run: () => {
        const created = wrapInShape(ids)
        if (created) editor.select({ type: 'widget', id: created })
      }
    },
    {
      kind: 'item',
      label: 'Unwrap the container',
      hint: 'Shift+Cmd/Ctrl+G',
      disabled: unwrappable === undefined,
      run: () => {
        if (!unwrappable) return
        const released = unwrapShape(unwrappable)
        if (released.length > 0) editor.selectMany(released)
      }
    },
    { kind: 'separator' },
    { kind: 'item', label: 'Bring to front', hint: 'Cmd/Ctrl+]', run: () => restack('front') },
    { kind: 'item', label: 'Bring forward', run: () => restack('forward') },
    { kind: 'item', label: 'Send backward', run: () => restack('backward') },
    { kind: 'item', label: 'Send to back', hint: 'Cmd/Ctrl+[', run: () => restack('back') },
    { kind: 'separator' },
    {
      kind: 'toggle',
      label: 'Locked',
      checked: Boolean(editor.locked[widgetId]),
      run: () => {
        for (const id of ids) editor.toggleLocked(id)
      }
    },
    {
      kind: 'toggle',
      label: 'Hidden while editing',
      checked: Boolean(editor.hidden[widgetId]),
      run: () => {
        for (const id of ids) editor.toggleHidden(id)
      }
    },
    ...(container
      ? ([
          {
            kind: 'item',
            label: 'Work inside it',
            hint: 'Double-click',
            run: () => editor.setDrillIn(widgetId)
          }
        ] as MenuEntry[])
      : []),
    ...(options.onRename
      ? ([{ kind: 'item', label: 'Rename…', run: options.onRename } as MenuEntry])
      : []),
    { kind: 'separator' },
    {
      kind: 'item',
      label: many ? `Delete ${ids.length} widgets` : 'Delete',
      hint: 'Del',
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
      label: 'Add',
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
    // From the library rather than from the clipboard. A widget goes through
    // the same placement the Templates page starts — the canvas follows the
    // pointer with it — so this is a shortcut to the entry, not a second way of
    // putting one down.
    {
      kind: 'submenu',
      label: 'Insert widget',
      items:
        widgets.length > 0
          ? widgets.map((entry) => ({
              kind: 'item' as const,
              label: entry.name,
              hint: `${entry.width} × ${entry.height}`,
              run: () => editor.beginInsert({ widget: entry.widget, label: entry.name })
            }))
          : [{ kind: 'item' as const, label: 'The widget library is empty', disabled: true, run: () => {} }]
    },
    {
      kind: 'item',
      label: 'Insert screen…',
      hint: 'from a saved dashboard',
      run: () => useInsertScreenStore.getState().openPicker()
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: 'Paste',
      hint: 'Cmd/Ctrl+V',
      run: () => void pasteWidget(display).then((added) => added && editor.select(added))
    },
    {
      kind: 'item',
      label: 'Select all on this screen',
      hint: 'Cmd/Ctrl+A',
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
      label: 'Snap to grid',
      checked: snap.snapToGrid,
      run: () => snap.setSnap({ snapToGrid: !snap.snapToGrid })
    },
    {
      kind: 'toggle',
      label: 'Snap to widgets',
      checked: snap.snapToWidgets,
      run: () => snap.setSnap({ snapToWidgets: !snap.snapToWidgets })
    },
    {
      kind: 'toggle',
      label: 'Snap to equal gaps',
      checked: snap.snapToSpacing,
      run: () => snap.setSnap({ snapToSpacing: !snap.snapToSpacing })
    },
    {
      kind: 'toggle',
      label: 'Resizing scales contents',
      checked: snap.scaleContents,
      run: () => snap.toggleScaleContents()
    }
  ]
}
