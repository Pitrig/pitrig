import { useEffect } from 'react'

import { useDeviceStore } from '@/features/device/device-store'
import { arrowStep, displayOf, movableSelection, nudge, resize } from './keyboard-geometry'
import { withEditGroup } from '@/features/device/edit-group'
import { screenWidgetsOf, screensOf } from '@shared/configuration-access'
import {
  absolutePlacement,
  activeScreen,
  copyWidget,
  deleteWidget,
  duplicateWidget,
  wrapInShape,
  pasteWidget,
  parentContainerId,
  restackOrder,
  restackWidget,
  selectedWidget,
  unwrapShape,
  useDashboardEditorStore
} from '../dashboard-editor'
import { isTextEntry } from './keyboard'
import { clamp } from './placement'
import { useSnapStore } from './snap-store'
import { clampPan, viewForBox } from '../preview/canvas-geometry'
import { MAXIMUM_ZOOM, MINIMUM_ZOOM } from './store'
import type { WidgetSelection } from '../dashboard-editor'

export function useEditorShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    let nudging = false

    const endNudge = (): void => {
      if (!nudging) return
      nudging = false
      useDeviceStore.getState().endEdit()
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTextEntry(event.target) || event.defaultPrevented) return
      if (document.querySelector('[aria-modal="true"]')) return
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
            .filter((id) => !editor.hidden[id])
        )
        return
      }
      if (accelerator && event.key.toLowerCase() === 'g') {
        event.preventDefault()
        if (event.shiftKey) {
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
        withEditGroup(() => {
          for (const id of restackOrder(configuration, editor.selectedIds, move)) {
            restackWidget(id, move)
          }
        })
        return
      }
      if (accelerator && /^[1-9]$/.test(event.key)) {
        event.preventDefault()
        const screens = screensOf(configuration).length
        if (screens > 0) editor.setActiveScreen(Math.min(Number(event.key) - 1, screens - 1))
        return
      }
      if (accelerator && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        useSnapStore.getState().toggleScaleContents()
        return
      }
      if (accelerator && (event.key === '0' || event.key === '=' || event.key === '-')) {
        event.preventDefault()
        if (event.key === '0') {
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
      if (event.key === 'Escape') {
        if (editor.activeTool !== 'select') {
          editor.setActiveTool('select')
          return
        }
        const parent = parentContainerId(configuration, selection)
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
        withEditGroup(() => {
          for (const id of selected) deleteWidget({ type: 'widget', id })
        })
        editor.select(undefined)
        return
      }

      const step = arrowStep(event.key)
      if (!step || !display) return
      event.preventDefault()
      const movable = movableSelection(configuration, selected).filter((id) => !editor.locked[id])
      if (movable.length === 0) return
      if (!nudging) {
        nudging = true
        store.beginEdit()
      }
      const resizing = accelerator && event.altKey
      for (const id of movable) {
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
    window.addEventListener('blur', endNudge)
    return () => {
      endNudge()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', endNudge)
    }
  }, [enabled])
}

function selectIfAdded(added: WidgetSelection | undefined): void {
  if (added) useDashboardEditorStore.getState().select(added)
}
