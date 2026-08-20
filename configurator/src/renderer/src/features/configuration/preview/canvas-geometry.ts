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
  /**
   * The container holding this widget, absent for one on the screen itself.
   * A gesture lines a widget up with its own siblings, so the canvas has to
   * know which level each layer belongs to.
   */
  parentId?: string
  /**
   * Where this widget's parent sits on the display — the sum of every container
   * above it — or zero for a widget on the screen.
   */
  offsetX: number
  offsetY: number
  /**
   * What the containers above this widget cut it down to, in display
   * coordinates: the intersection of every clipping ancestor's box, or
   * undefined when nothing above it clips. A container's own frame and caption
   * are not in it — the device draws both on the parent, so a container never
   * cuts its own edge off.
   */
  clip?: Placement
}

/**
 * The part two boxes share. Empty where they miss each other entirely, which is
 * a widget dragged clean out of the container it belongs to: nothing of it is
 * drawn, exactly as on the board.
 */
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

/**
 * Whether this container cuts its children off at its box. Omitted means it
 * does, which is the schema default and LVGL's own behaviour; a slot answers
 * for every one of its pages at once.
 */
export function clipsChildren(widget: WidgetConfiguration): boolean {
  return (
    (widget.type === 'shape' || widget.type === 'slot') && widget.clip_children !== false
  )
}

/**
 * Fragment identifiers referenced from `url(#…)`. They are derived from
 * positions rather than from ids because a widget id is author-supplied and
 * bounded only in length — a space or a quote in one would produce
 * markup that silently references nothing.
 */
export function widgetClipId(index: number): string {
  return `widget-clip-${index}`
}

/** The clip the containers above one layer impose, as opposed to its own box. */
export function containerClipId(index: number): string {
  return `container-clip-${index}`
}

/**
 * React's generated ids carry punctuation of their own, which the same
 * references cannot take either.
 */
export function markupId(generated: string): string {
  return generated.replace(/[^A-Za-z0-9_-]/g, '')
}

/**
 * Which page of a slot the canvas draws. The tabs pick one; before anything is
 * picked it is the first page in the loop, which is where the device starts too.
 */
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


/** The only part of a display these need: a board descriptor satisfies it. */
export type DisplaySize = { width: number; height: number }

export type ResizeMode = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type InteractionMode = 'move' | ResizeMode
export type Placement = Required<NonNullable<TextWidgetConfiguration['placement']>>

/** A widget that moves with the one under the pointer. */
export interface Follower {
  id: string
  placement: Placement
}

/**
 * A gesture in progress. `placement` is the box it started from — the widget's
 * own, or the one around the whole selection — and every frame resolves the
 * pointer against that rather than against the last frame, so the same pointer
 * position always means the same result.
 */
export interface Interaction {
  pointerId: number
  target: WidgetSelection
  mode: InteractionMode
  start: { x: number; y: number }
  placement: Placement
  /** Widgets carried along by a move. */
  followers: Follower[]
  /**
   * What a resize acts on, snapshotted whole: one widget, or every outermost
   * member of the selection when the group's own frame is being dragged.
   */
  subjects: ScaleSubject[]
  /** The container the gesture began inside, which is the level it lines up within. */
  level?: string
}

/** A box drawn on the canvas by a tool, which becomes a widget on release. */
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

/**
 * The container a dragged box would join: the innermost one that holds it
 * whole. Entirely inside rather than under the pointer, so a readout the author
 * deliberately hung over the edge of a plate is not swallowed by it, and so the
 * answer does not change with where on the widget the drag was started.
 *
 * `layers` is in draw order — a parent immediately before what is inside it —
 * so the last container that qualifies is the deepest one, at any nesting.
 * Locked and hidden layers are not candidates: a drop into something the author
 * has set aside reads as the widget vanishing.
 */
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

/** Screen pixels per logical pixel, which is what a pan in client space costs. */
export function viewportScale(
  svg: SVGSVGElement | null,
  display: DisplaySize,
  zoom: number
): number {
  const width = svg?.getBoundingClientRect().width ?? display.width
  return (width / display.width) * zoom
}

/**
 * Keeps the view over the display. Magnified there is more display than
 * viewport and the pan says which part is shown; below one to one the viewport
 * is the larger of the two, so there is nothing to pan to and the display is
 * centred in the space instead of sitting in a corner.
 */
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

/**
 * The view that puts one box on screen: magnified until it nearly fills the
 * canvas, and centred. A margin is left around it deliberately — a box scaled
 * to the very edge gives no sense of where on the display it sits.
 *
 * The zoom is a factor over "the whole display fits the canvas", which is what
 * one means here: the surface always scales to the space it has, so a
 * percentage of physical pixels would be a number about the window rather than
 * about the dashboard.
 */
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
