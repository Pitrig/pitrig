import type { RefObject } from 'react'
import type { DeviceConfiguration, DisplayDescriptor } from '@shared/device'
import type { WidgetSelection } from '../dashboard-editor'
import type { Placement, PreviewLayer } from './canvas-geometry'
import type { SnapGuide, GapLabel, SnapMode } from './snapping'
import type { CanvasTool } from '../editor/store'
import type { useSnapStore } from '../editor/snap-store'

export interface Feedback {
  guides: SnapGuide[]
  gaps: GapLabel[]
  highlighted: string[]
  badge?: { placement: Placement; mode: 'move' | 'resize' }
}

export const NO_FEEDBACK: Feedback = { guides: [], gaps: [], highlighted: [] }

export interface Modifiers {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export interface CanvasContext {
  svgRef: RefObject<SVGSVGElement | null>
  configuration: DeviceConfiguration
  display: DisplayDescriptor
  layers: PreviewLayer[]
  placements: Map<string, Placement>
  gridSize: number
  snap: ReturnType<typeof useSnapStore.getState>
  view: { zoom: number; panX: number; panY: number }
  drillIn: string | undefined
  locked: Record<string, boolean>
  hidden: Record<string, boolean>
  selection: WidgetSelection | undefined
  selectedIds: readonly string[]
  select: (selection: WidgetSelection) => void
  extendSelection: (id: string) => void
  selectMany: (ids: string[]) => void
  activeTool: CanvasTool
  setActiveTool: (tool: CanvasTool) => void
}

export function snapMode(event: {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}): SnapMode {
  if (!event.metaKey && !event.ctrlKey) return 'all'
  return event.shiftKey ? 'none' : 'grid'
}

export const MINIMUM_DRAWN_PX = 4

export function drawnBox(
  start: { x: number; y: number },
  current: { x: number; y: number }
): Placement {
  return {
    x: Math.round(Math.min(start.x, current.x)),
    y: Math.round(Math.min(start.y, current.y)),
    width: Math.round(Math.abs(current.x - start.x)),
    height: Math.round(Math.abs(current.y - start.y))
  }
}

export function unionOf(placements: readonly Placement[]): Placement | undefined {
  if (placements.length === 0) return undefined
  const left = Math.min(...placements.map((box) => box.x))
  const top = Math.min(...placements.map((box) => box.y))
  const right = Math.max(...placements.map((box) => box.x + box.width))
  const bottom = Math.max(...placements.map((box) => box.y + box.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}
