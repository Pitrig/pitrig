import { useEffect } from 'react'

import { BOARD_PROFILES } from '@shared/device'
import type { DeviceConfiguration } from '@shared/device'
import { useDeviceStore } from '@/features/device/device-store'
import { withEditGroup } from '@/features/device/edit-group'
import { screenWidgetsOf } from '@shared/configuration-access'
import {
  absolutePlacement,
  activeScreen,
  copyWidget,
  deleteWidget,
  duplicateWidget,
  findWidget,
  wrapInShape,
  mutateSelectedWidget,
  parentOffset,
  pasteWidget,
  parentContainerId,
  restackOrder,
  restackWidget,
  selectedWidget,
  unwrapShape,
  useDashboardEditorStore
} from '../dashboard-editor'
import { isTextEntry } from './keyboard'
import { clamp, clampToDisplay } from './placement'
import { scaleWidgets } from './geometry-commands'
import { useSnapStore } from './snap-store'
import { MINIMUM_SIZE_PX } from '../preview/snapping'
import { clampPan, viewForBox } from '../preview/canvas-geometry'
import { MAXIMUM_ZOOM, MINIMUM_ZOOM } from './store'
import type { WidgetSelection } from '../dashboard-editor'

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

      if (accelerator && !event.shiftKey && event.key.toLowerCase() === 'c') {
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
          screenWidgetsOf(activeScreen(configuration))
            .map((widget) => widget.id)
            .filter((id): id is string => Boolean(id))
        )
        return
      }
      // Wrapping is a document edit — the device switches an area by container
      // — so it goes through the draft like any other, in one history entry.
      if (accelerator && event.key.toLowerCase() === 'g') {
        event.preventDefault()
        if (event.shiftKey) {
          // Unwrap whichever container the selection points at: the container
          // itself when it is selected, otherwise the one holding the widget.
          const target =
            selection?.type === 'widget' && selectedWidget(configuration, selection)?.type === 'shape'
              ? selection.id
              : parentContainerId(configuration, selection)
          if (target) {
            const released = unwrapShape(target)
            if (released.length > 0) editor.selectMany(released)
          }
          return
        }
        const created = wrapInShape(editor.selectedIds)
        if (created) editor.select({ type: 'widget', id: created })
        return
      }
      // Restacking, on the brackets every drawing editor puts it on. Alt is the
      // one-step version, as it is in Illustrator and PowerPoint.
      if (accelerator && (event.key === ']' || event.key === '[')) {
        event.preventDefault()
        const forward = event.key === ']'
        const move = event.altKey
          ? forward
            ? 'forward'
            : 'backward'
          : forward
            ? 'front'
            : 'back'
        // One entry for the whole selection, the way a multi-delete is one.
        // The order the moves are applied in is what keeps a group arranged as
        // it was, so it is asked for rather than assumed.
        withEditGroup(() => {
          for (const id of restackOrder(configuration, editor.selectedIds, move)) {
            restackWidget(id, move)
          }
        })
        return
      }
      // Screens are switched by number, the way the driver swipes between them.
      if (accelerator && /^[1-9]$/.test(event.key)) {
        event.preventDefault()
        editor.setActiveScreen(Number(event.key) - 1)
        return
      }
      // Whether a container carries its contents when it is resized. A mode
      // rather than a held key, so it is bound like one.
      if (accelerator && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        useSnapStore.getState().toggleScaleContents()
        return
      }
      if (accelerator && (event.key === '0' || event.key === '=' || event.key === '-')) {
        event.preventDefault()
        if (event.key === '0') {
          // Shift asks for the selection instead of the whole display, which is
          // the pair every canvas binds — and zero is free where 1 to 9 are not.
          const box =
            event.shiftKey && display && selection?.type === 'widget'
              ? absolutePlacement(configuration, selection.id)
              : undefined
          editor.setView(
            box && display
              ? viewForBox(box, display, { minimum: MINIMUM_ZOOM, maximum: MAXIMUM_ZOOM })
              : { zoom: 1, panX: 0, panY: 0 }
          )
          return
        }
        if (!display) return
        const zoom = clamp(
          editor.view.zoom * (event.key === '=' ? 1.25 : 0.8),
          MINIMUM_ZOOM,
          MAXIMUM_ZOOM
        )
        editor.setView({ zoom, ...clampPan(editor.view, display, zoom) })
        return
      }
      // Escape is the way back out: it selects the container holding whatever
      // is selected, and clears the selection once there is nothing above.
      // Inside an opened container it leaves that first, which is the level
      // above everything in it.
      if (event.key === 'Escape') {
        // A tool is the outermost thing to leave: a press meant to put the
        // pointer back is not a request to change the selection as well.
        if (editor.activeTool !== 'select') {
          editor.setActiveTool('select')
          return
        }
        const parent = parentContainerId(configuration, selection)
        // One rung at a time: select the container holding the selection, and
        // once the opened container is itself what is selected, step out of it
        // into its own parent. Containers nest, so leaving the innermost is not
        // the same as leaving them all — that is the crumb marked "Screen".
        if (editor.drillIn && selection?.type === 'widget' && selection.id === editor.drillIn) {
          editor.setDrillIn(parent)
          return
        }
        editor.select(parent ? { type: 'widget', id: parent } : undefined)
        return
      }
      const selected = editor.selectedIds
      if (selected.length === 0) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        // One entry for the whole group: deleting four widgets is one edit.
        withEditGroup(() => {
          for (const id of selected) deleteWidget({ type: 'widget', id })
        })
        editor.select(undefined)
        return
      }

      const step = arrowStep(event.key)
      if (!step || !display) return
      event.preventDefault()
      if (!nudging) {
        nudging = true
        store.beginEdit()
      }
      // Same key, same run-grouping, two writes: the arrows move the selection
      // and the accelerator with Alt resizes it, which is the pair SimHub binds.
      // Right and down grow, left and up shrink.
      const resizing = accelerator && event.altKey
      for (const id of selected) {
        const target: WidgetSelection = { type: 'widget', id }
        if (resizing) resize(target, configuration, display, step, event.shiftKey)
        else nudge(target, configuration, display, step, event.shiftKey)
      }
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      if (arrowStep(event.key)) endNudge()
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

function arrowStep(key: string): { x: number; y: number } | undefined {
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

/**
 * Grows or shrinks one widget from its bottom-right corner, which is what a
 * keyboard resize can mean without an anchor to pick. Bounded exactly as the
 * pointer resize is: no smaller than the handles allow, and never past the
 * display — and through the same command, so "scale contents" means the same
 * thing whichever way the box was resized.
 */
function resize(
  selection: WidgetSelection,
  configuration: DeviceConfiguration,
  display: { width: number; height: number },
  step: { x: number; y: number },
  coarse: boolean
): void {
  if (selection.type !== 'widget') return
  const location = findWidget(configuration, selection.id)
  const placement = absolutePlacement(configuration, selection.id)
  if (!location || !placement) return
  const distance = coarse ? COARSE_NUDGE_PX : NUDGE_PX
  const width = clamp(
    placement.width + step.x * distance,
    MINIMUM_SIZE_PX,
    Math.max(MINIMUM_SIZE_PX, display.width - placement.x)
  )
  const height = clamp(
    placement.height + step.y * distance,
    MINIMUM_SIZE_PX,
    Math.max(MINIMUM_SIZE_PX, display.height - placement.y)
  )
  if (width === placement.width && height === placement.height) return
  scaleWidgets(
    [
      {
        id: selection.id,
        // One keypress is one edit from the document as it stands, so the
        // widget itself is the state to scale — unlike a drag, which re-derives
        // every frame from where the gesture began.
        original: JSON.parse(JSON.stringify(location.widget)),
        box: placement
      }
    ],
    placement,
    { ...placement, width, height },
    display,
    useSnapStore.getState().scaleContents
  )
}

function nudge(
  selection: WidgetSelection,
  configuration: DeviceConfiguration,
  display: { width: number; height: number },
  step: { x: number; y: number },
  coarse: boolean
): void {
  if (selection.type !== 'widget') return
  // Clamped in display space the same way dragging is, so the keyboard cannot
  // place a widget where the pointer could not; a widget in a container is then
  // written back in its group's space.
  const placement = absolutePlacement(configuration, selection.id)
  if (!placement) return
  const offset = parentOffset(configuration, selection.id)
  const distance = coarse ? COARSE_NUDGE_PX : NUDGE_PX
  const { x, y } = clampToDisplay(
    placement.x + step.x * distance,
    placement.y + step.y * distance,
    placement.width,
    placement.height,
    display
  )
  if (x === placement.x && y === placement.y) return
  mutateSelectedWidget(selection, (widget) => {
    widget.placement = { ...placement, x: x - offset.x, y: y - offset.y }
  })
}


function displayOf(
  configuration: DeviceConfiguration
): { width: number; height: number } | undefined {
  return BOARD_PROFILES[configuration.board]?.display
}

