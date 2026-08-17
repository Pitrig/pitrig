import { type ShapeWidgetConfiguration, type TextWidgetConfiguration, type WidgetAction, type WidgetConfiguration } from '../../../../../shared/configuration-schema'
import { type DisplayDescriptor } from '../../../../../shared/device'
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

/**
 * React's generated ids carry punctuation of their own, which the same
 * references cannot take either.
 */
export function markupId(generated: string): string {
  return generated.replace(/[^A-Za-z0-9_-]/g, '')
}

/**
 * Whether a container is the one its slot is currently being looked at through.
 * A shape outside a slot is always drawn; inside one, the picked shape wins and
 * the slot default stands in until something is picked.
 */
export function visibleInSlot(
  containers: ShapeWidgetConfiguration[],
  container: ShapeWidgetConfiguration,
  picked: Record<number, string>
): boolean {
  const slot = container.slot ?? 0
  if (slot === 0) return true
  const chosen = picked[slot]
  if (chosen !== undefined) return container.id === chosen
  const members = containers.filter((entry) => (entry.slot ?? 0) === slot)
  const fallback = members.find((entry) => entry.slot_default) ?? members[0]
  return container.id === fallback?.id
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

// Ten frames a second: enough for a colour ramp to read as continuous and for a
// blink to be legible, without re-rendering the canvas at display rate.
export const PREVIEW_TICK_MS = 100

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
        x: Math.round(clamp(horizontal.value, 0, display.width - original.width)),
        y: Math.round(clamp(vertical.value, 0, display.height - original.height))
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

export function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)) }
