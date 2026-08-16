import { useEffect } from 'react'

import { BOARD_PROFILES } from '../../../../shared/device'
import type { DeviceConfiguration } from '../../../../shared/device'
import { useDeviceStore } from '@/features/device/device-store'
import { widgetsOf } from '../../../../shared/configuration-access'
import {
  activeScreen,
  completePlacement,
  copyWidget,
  deleteWidget,
  duplicateWidget,
  findWidget,
  mutateSelectedWidget,
  pasteWidget,
  useDashboardEditorStore
} from './dashboard-editor'
import type { WidgetSelection } from './dashboard-editor'

// The whole window listens, because the canvas is an SVG that nothing focuses
// and the shortcuts are about the selected widget rather than about whatever
// happens to have focus. Anything typed into a field is left alone.
const NUDGE_PX = 1
const COARSE_NUDGE_PX = 10

/**
 * Keyboard editing for the canvas. A held arrow key repeats, so the whole run
 * is grouped into one history entry and committed when the key comes back up.
 */
export function useEditorShortcuts(): void {
  useEffect(() => {
    let nudging = false

    const endNudge = (): void => {
      if (!nudging) return
      nudging = false
      useDeviceStore.getState().endEdit()
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTextEntry(event.target)) return
      const store = useDeviceStore.getState()
      const editor = useDashboardEditorStore.getState()
      const configuration = store.draft
      const selection = editor.selection
      const accelerator = event.metaKey || event.ctrlKey

      if (accelerator && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) store.redo()
        else store.undo()
        return
      }
      if (accelerator && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        store.redo()
        return
      }
      if (!configuration) return
      const display = displayOf(configuration)

      if (accelerator && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        void copyWidget(configuration, selection)
        return
      }
      if (accelerator && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        if (display) void pasteWidget(display).then(selectIfAdded)
        return
      }
      if (accelerator && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        if (display && selection) selectIfAdded(duplicateWidget(selection, display))
        return
      }
      if (accelerator && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        editor.selectMany(
          widgetsOf(activeScreen(configuration))
            .map((widget) => widget.id)
            .filter((id): id is string => Boolean(id))
        )
        return
      }
      if (event.key === 'Escape') {
        editor.select(undefined)
        return
      }
      const selected = editor.selectedIds
      if (selected.length === 0) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        // One entry for the whole group: deleting four widgets is one edit.
        store.beginEdit()
        for (const id of selected) deleteWidget({ type: 'widget', id })
        store.endEdit()
        editor.select(undefined)
        return
      }

      const step = nudgeStep(event.key)
      if (!step || !display) return
      event.preventDefault()
      if (!nudging) {
        nudging = true
        store.beginEdit()
      }
      for (const id of selected) {
        nudge({ type: 'widget', id }, configuration, display, step, event.shiftKey)
      }
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      if (nudgeStep(event.key)) endNudge()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    // Losing the window mid-repeat would otherwise leave the group open, and
    // every later edit would collapse into it.
    window.addEventListener('blur', endNudge)
    return () => {
      endNudge()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', endNudge)
    }
  }, [])
}

function selectIfAdded(added: WidgetSelection | undefined): void {
  if (added) useDashboardEditorStore.getState().select(added)
}

function nudgeStep(key: string): { x: number; y: number } | undefined {
  switch (key) {
    case 'ArrowLeft':
      return { x: -1, y: 0 }
    case 'ArrowRight':
      return { x: 1, y: 0 }
    case 'ArrowUp':
      return { x: 0, y: -1 }
    case 'ArrowDown':
      return { x: 0, y: 1 }
    default:
      return undefined
  }
}

function nudge(
  selection: WidgetSelection,
  configuration: DeviceConfiguration,
  display: { width: number; height: number },
  step: { x: number; y: number },
  coarse: boolean
): void {
  const current = findWidget(configuration, selection.type === 'widget' ? selection.id : '')
  const placement = completePlacement(current?.widget.placement)
  if (!placement) return
  const distance = coarse ? COARSE_NUDGE_PX : NUDGE_PX
  // Clamped the same way dragging is, so the keyboard cannot place a widget
  // where the pointer could not.
  const x = clamp(placement.x + step.x * distance, 0, display.width - placement.width)
  const y = clamp(placement.y + step.y * distance, 0, display.height - placement.height)
  if (x === placement.x && y === placement.y) return
  mutateSelectedWidget(selection, (widget) => {
    widget.placement = { ...placement, x, y }
  })
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

function displayOf(
  configuration: DeviceConfiguration
): { width: number; height: number } | undefined {
  return BOARD_PROFILES[configuration.board]?.display
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}
