import { pagesOf } from '@shared/configuration-access'
import { type SlotWidgetConfiguration, type TextWidgetConfiguration, type WidgetAction, type WidgetConfiguration } from '@shared/configuration-schema'
import { clamp } from '../editor/placement'
import type { ScaleSubject } from '../editor/geometry-commands'
import type { CanvasTool } from '../editor/store'
import type { WidgetSelection } from '../dashboard-editor'

export interface PreviewLayer {
  configuration: WidgetConfiguration
  zIndex: number
  configurationOrder: number
  parentId?: string
  offsetX: number
  offsetY: number
  clip?: Placement
  behind: string
}

export function intersection(outer: Placement, inner: Placement): Placement {
  const x = Math.max(outer.x, inner.x)
  const y = Math.max(outer.y, inner.y)
  return {
    x,
    y,
    width: Math.max(0, Math.min(outer.x + outer.width, inner.x + inner.width) - x),
    height: Math.max(0, Math.min(outer.y + outer.height, inner.y + inner.height) - y)
  }
}

export function clipsChildren(widget: WidgetConfiguration): boolean {
  return (
    (widget.type === 'shape' || widget.type === 'slot') && widget.clip_children !== false
  )
}

export function widgetClipId(index: number): string {
  return `widget-clip-${index}`
}

export function containerClipId(index: number): string {
  return `container-clip-${index}`
}

export function markupId(generated: string): string {
  return generated.replace(/[^A-Za-z0-9_-]/g, '')
}

export function visibleSlotPage(
  widget: SlotWidgetConfiguration,
  picked: Record<string, number>
): number {
  const pages = pagesOf(widget)
  const chosen = widget.id === undefined ? undefined : picked[widget.id]
  if (chosen !== undefined && chosen < pages.length) return chosen
  const loop = pages.findIndex((page) => page.in_loop !== false)
  return loop < 0 ? 0 : loop
}

export function actionLabel(action: WidgetAction | undefined): string {
  if (!action || action.type === 'none') return ''
  if (action.type === 'goto_screen') return `→ ${action.screen ?? ''}`
  return action.type === 'next_screen' ? '→ next' : '→ prev'
}


export type DisplaySize = { width: number; height: number }

export type ResizeMode = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type InteractionMode = 'move' | ResizeMode
export type Placement = Required<NonNullable<TextWidgetConfiguration['placement']>>

export interface Follower {
  id: string
  placement: Placement
}

export interface Interaction {
  pointerId: number
  target: WidgetSelection
  mode: InteractionMode
  start: { x: number; y: number }
  placement: Placement
  followers: Follower[]
  subjects: ScaleSubject[]
  level?: string
}

export interface Draw {
  pointerId: number
  tool: Exclude<CanvasTool, 'select'>
  start: { x: number; y: number }
  current: { x: number; y: number }
}

export interface Marquee {
  pointerId: number
  start: { x: number; y: number }
  current: { x: number; y: number }
  additive: boolean
}

export interface Pan {
  pointerId: number
  startClientX: number
  startClientY: number
  startPanX: number
  startPanY: number
}

export function marqueeBounds(marquee: Marquee): Placement {
  return {
    x: Math.min(marquee.start.x, marquee.current.x),
    y: Math.min(marquee.start.y, marquee.current.y),
    width: Math.abs(marquee.current.x - marquee.start.x),
    height: Math.abs(marquee.current.y - marquee.start.y)
  }
}

export function containerAt(
  layers: readonly PreviewLayer[],
  placements: ReadonlyMap<string, Placement>,
  box: Placement,
  excluded: ReadonlySet<string>,
  locked: Readonly<Record<string, boolean>>,
  hidden: Readonly<Record<string, boolean>>
): string | undefined {
  let found: string | undefined
  for (const layer of layers) {
    const id = layer.configuration.id
    if (!id || excluded.has(id) || locked[id] || hidden[id]) continue
    if (layer.configuration.type !== 'shape' && layer.configuration.type !== 'slot') continue
    const container = placements.get(id)
    if (!container) continue
    if (
      box.x >= container.x &&
      box.y >= container.y &&
      box.x + box.width <= container.x + container.width &&
      box.y + box.height <= container.y + container.height
    ) {
      found = id
    }
  }
  return found
}

export function intersects(placement: Placement, bounds: Placement): boolean {
  return (
    placement.x < bounds.x + bounds.width &&
    placement.x + placement.width > bounds.x &&
    placement.y < bounds.y + bounds.height &&
    placement.y + placement.height > bounds.y
  )
}

export function viewportScale(
  svg: SVGSVGElement | null,
  display: DisplaySize,
  zoom: number
): number {
  const width = svg?.getBoundingClientRect().width ?? display.width
  return (width / display.width) * zoom
}

export function clampPan(
  pan: { panX: number; panY: number },
  display: DisplaySize,
  zoom: number
): { panX: number; panY: number } {
  const spareX = display.width - display.width / zoom
  const spareY = display.height - display.height / zoom
  return {
    panX: spareX >= 0 ? clamp(pan.panX, 0, spareX) : spareX / 2,
    panY: spareY >= 0 ? clamp(pan.panY, 0, spareY) : spareY / 2
  }
}


export function logicalPoint(svg: SVGSVGElement | null, clientX: number, clientY: number): { x: number; y: number } | undefined {
  if (!svg) return undefined
  const matrix = svg.getScreenCTM()
  if (!matrix) return undefined
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
  return { x: point.x, y: point.y }
}

export function viewForBox(
  box: Placement,
  display: DisplaySize,
  bounds: { minimum: number; maximum: number }
): { zoom: number; panX: number; panY: number } {
  const fit = Math.min(
    box.width > 0 ? display.width / box.width : bounds.maximum,
    box.height > 0 ? display.height / box.height : bounds.maximum
  )
  const zoom = clamp(fit * 0.8, bounds.minimum, bounds.maximum)
  return {
    zoom,
    ...clampPan(
      {
        panX: box.x + box.width / 2 - display.width / zoom / 2,
        panY: box.y + box.height / 2 - display.height / zoom / 2
      },
      display,
      zoom
    )
  }
}
