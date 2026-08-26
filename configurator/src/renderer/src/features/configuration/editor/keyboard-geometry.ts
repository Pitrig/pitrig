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
