import { MINIMUM_SIZE_PX } from '../preview/snapping'
import { BOARD_PROFILES, type DeviceConfiguration } from '@shared/device'
import { clamp, clampToDisplay } from './placement'
import {
  absolutePlacement,
  findWidget,
  mutateSelectedWidget,
  parentOffset
} from './document'
import { scaleWidgets } from './geometry-commands'
import { useSnapStore } from './snap-store'
import type { WidgetSelection } from './store'

// The keyboard's share of canvas geometry: what one arrow press means for a
// box, at either step size. The hook that binds keys to these lives in
// use-editor-shortcuts.ts.

const NUDGE_PX = 1
const COARSE_NUDGE_PX = 10

export function arrowStep(key: string): { x: number; y: number } | undefined {
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
export function resize(
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

export function nudge(
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


export function displayOf(
  configuration: DeviceConfiguration
): { width: number; height: number } | undefined {
  return BOARD_PROFILES[configuration.board]?.display
}
