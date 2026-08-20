import { pagesOf } from '@shared/configuration-access'
import { type SlotWidgetConfiguration, type TextWidgetConfiguration, type WidgetAction, type WidgetConfiguration } from '@shared/configuration-schema'
import { type DisplayDescriptor } from '@shared/device'
import { clamp, clampToDisplay } from '../editor/placement'
import { type WidgetSelection, completePlacement } from '../dashboard-editor'

export interface PreviewLayer {
  configuration: WidgetConfiguration
  zIndex: number
  configurationOrder: number
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


export type ResizeMode = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type InteractionMode = 'move' | ResizeMode
export type Placement = Required<NonNullable<TextWidgetConfiguration['placement']>>

/** A widget that moves with the one under the pointer. */
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

/** Lines the dragged widget snapped to, drawn while the drag is in progress. */
export interface Guides {
  x: number[]
  y: number[]
}

export const NO_GUIDES: Guides = { x: [], y: [] }

// How close an edge has to be before it snaps, in screen pixels.
export const SNAP_TOLERANCE_PX = 6

export interface SnapTargets {
  x: number[]
  y: number[]
}

/**
 * The lines a dragged widget can snap to: every other widget's left, centre and
 * right, its top, middle and bottom, and the display's own edges and centre.
 * Hidden widgets contribute nothing, because a line to something invisible
 * cannot be understood.
 */
export function collectSnapTargets(
  widgets: readonly WidgetConfiguration[],
  display: DisplayDescriptor,
  dragged: WidgetSelection | undefined,
  hidden: Readonly<Record<string, boolean>>
): SnapTargets {
  const draggedId = dragged?.type === 'widget' ? dragged.id : undefined
  const x = [0, display.width / 2, display.width]
  const y = [0, display.height / 2, display.height]
  for (const widget of widgets) {
    if (!widget.id || widget.id === draggedId || hidden[widget.id]) continue
    const placement = completePlacement(widget.placement)
    if (!placement) continue
    x.push(placement.x, placement.x + placement.width / 2, placement.x + placement.width)
    y.push(placement.y, placement.y + placement.height / 2, placement.y + placement.height)
  }
  return { x, y }
}

interface SnapOptions {
  grid: number
  tolerance: number
  targets: SnapTargets
}

/**
 * Snaps one coordinate. The widget's own three edges are each tried against
 * every target, and the nearest match within tolerance wins, so a widget lines
 * up by whichever of its edges is closest to something.
 */
function snapAxis(
  start: number,
  size: number,
  targets: readonly number[],
  options: SnapOptions
): { value: number; guide?: number } {
  let best: { value: number; guide: number; distance: number } | undefined
  for (const edge of [0, size / 2, size]) {
    for (const target of targets) {
      const candidate = target - edge
      const distance = Math.abs(candidate - start)
      if (distance > options.tolerance) continue
      if (!best || distance < best.distance) {
        best = { value: candidate, guide: target, distance }
      }
    }
  }
  if (best) return { value: best.value, guide: best.guide }
  if (options.grid > 0) return { value: Math.round(start / options.grid) * options.grid }
  return { value: start }
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
  display: DisplayDescriptor,
  zoom: number
): number {
  const width = svg?.getBoundingClientRect().width ?? display.width
  return (width / display.width) * zoom
}

export function clampPan(
  pan: { panX: number; panY: number },
  display: DisplayDescriptor,
  zoom: number
): { panX: number; panY: number } {
  return {
    panX: clamp(pan.panX, 0, display.width - display.width / zoom),
    panY: clamp(pan.panY, 0, display.height - display.height / zoom)
  }
}


export function logicalPoint(svg: SVGSVGElement | null, clientX: number, clientY: number): { x: number; y: number } | undefined {
  if (!svg) return undefined
  const matrix = svg.getScreenCTM()
  if (!matrix) return undefined
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
  return { x: point.x, y: point.y }
}

export function transformedPlacement(
  interaction: Interaction,
  dx: number,
  dy: number,
  display: DisplayDescriptor,
  snap: SnapOptions
): { placement: Placement; guides: Guides } {
  const original = interaction.placement
  if (interaction.mode === 'move') {
    const horizontal = snapAxis(original.x + dx, original.width, snap.targets.x, snap)
    const vertical = snapAxis(original.y + dy, original.height, snap.targets.y, snap)
    return {
      placement: {
        ...original,
        ...clampToDisplay(horizontal.value, vertical.value, original.width,
                          original.height, display)
      },
      guides: {
        x: horizontal.guide === undefined ? [] : [horizontal.guide],
        y: vertical.guide === undefined ? [] : [vertical.guide]
      }
    }
  }
  const minimum = 8
  // A resized edge snaps to the grid but not to another widget: a size that
  // quietly followed a neighbour would be harder to predict than to correct.
  const align = (value: number): number =>
    snap.grid > 0 ? Math.round(value / snap.grid) * snap.grid : value
  let left = original.x
  let top = original.y
  let right = original.x + original.width
  let bottom = original.y + original.height
  if (interaction.mode.includes('w')) left = clamp(align(original.x + dx), 0, right - minimum)
  if (interaction.mode.includes('e')) right = clamp(align(original.x + original.width + dx), left + minimum, display.width)
  if (interaction.mode.includes('n')) top = clamp(align(original.y + dy), 0, bottom - minimum)
  if (interaction.mode.includes('s')) bottom = clamp(align(original.y + original.height + dy), top + minimum, display.height)
  return {
    placement: { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) },
    guides: NO_GUIDES
  }
}

