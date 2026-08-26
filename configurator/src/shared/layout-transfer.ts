import { childArraysOf, widgetsOf } from './configuration-access'
import { type ApplicationConfiguration, type WidgetConfiguration, type WidgetPlacement, type WidgetType } from './configuration-schema'
import { BOARD_PROFILES, type SimCoreBoardId } from './device'
import { scaleAxis, scaleWidgetFields } from './layout-transfer-fields'
import { repairArcThickness, repairFrameInset } from './layout-transfer-repairs'

export interface DisplaySize {
  width: number
  height: number
}

export type LayoutFit = 'contain' | 'stretch'

export const LAYOUT_FITS: readonly LayoutFit[] = ['contain', 'stretch']

export interface LayoutTransferTarget {
  board: SimCoreBoardId
  display?: DisplaySize
  fit?: LayoutFit
}

export interface Scale {
  x: number
  y: number
  min: number
}

export type LayoutTransferNoteKind =
  | 'image_resize_required'
  | 'field_clamped'
  | 'arc_thickness_reduced'
  | 'widget_off_display'

export interface LayoutTransferNote {
  kind: LayoutTransferNoteKind
  screenIndex: number
  widgetId?: string
  widgetType?: WidgetType
  field?: string
  from?: number
  to?: number
  imageId?: string
  size?: DisplaySize
}

export interface LayoutTransferResult {
  configuration: ApplicationConfiguration
  fit: LayoutFit
  scale: Scale
  offset: { x: number; y: number }
  from: DisplaySize
  to: DisplaySize
  notes: LayoutTransferNote[]
}

const MAXIMUM_NOTES = 200

export function transferConfiguration(
  configuration: ApplicationConfiguration,
  target: LayoutTransferTarget
): LayoutTransferResult {
  const next = JSON.parse(JSON.stringify(configuration)) as ApplicationConfiguration
  const to = target.display ?? BOARD_PROFILES[target.board].display
  const from = BOARD_PROFILES[configuration.board]?.display ?? to
  next.board = target.board

  const fit = target.fit ?? 'contain'
  const notes: LayoutTransferNote[] = []
  if (from.width === to.width && from.height === to.height) {
    const unchanged = { x: 1, y: 1, min: 1 }
    return { configuration: next, fit, scale: unchanged, offset: { x: 0, y: 0 }, from, to, notes }
  }

  const ratio = { x: to.width / from.width, y: to.height / from.height }
  const uniform = Math.min(ratio.x, ratio.y)
  const scale: Scale =
    fit === 'stretch'
      ? { x: ratio.x, y: ratio.y, min: uniform }
      : { x: uniform, y: uniform, min: uniform }
  const offset =
    fit === 'stretch'
      ? { x: 0, y: 0 }
      : {
          x: Math.floor((to.width - Math.round(from.width * scale.x)) / 2),
          y: Math.floor((to.height - Math.round(from.height * scale.y)) / 2)
        }

  const note = (entry: LayoutTransferNote): void => {
    if (notes.length < MAXIMUM_NOTES) notes.push(entry)
  }

  const visit = (
    widgets: readonly WidgetConfiguration[],
    screenIndex: number,
    origin: { x: number; y: number },
    depth: number
  ): void => {
    for (const widget of widgets) {
      const before = placementSize(widget.placement)
      scalePlacement(widget.placement, scale, depth === 0 ? offset : NO_SHIFT)

      const box = widget.placement
      const absolute = { x: origin.x + (box?.x ?? 0), y: origin.y + (box?.y ?? 0) }
      const label = { screenIndex, widgetId: widget.id, widgetType: widget.type }

      if (box && isOffDisplay(absolute, box, to)) {
        note({ kind: 'widget_off_display', ...label })
      }

      scaleWidgetFields(widget, scale, (field, from, to) => {
        note({ kind: 'field_clamped', ...label, field: field.path, from, to })
      })
      repairArcThickness(widget, (from, to) => {
        note({ kind: 'arc_thickness_reduced', ...label, field: 'thickness_px', from, to })
      })
      repairFrameInset(widget, (field, from, to) => {
        note({ kind: 'field_clamped', ...label, field, from, to })
      })
      noteImageResize(widget, before, label, note)

      for (const children of childArraysOf(widget)) {
        visit(children, screenIndex, absolute, depth + 1)
      }
    }
  }

  const screens = next.dashboard?.screens ?? []
  for (let screenIndex = 0; screenIndex < screens.length; ++screenIndex) {
    const screen = screens[screenIndex]
    if (!screen) continue
    visit(widgetsOf(screen), screenIndex, { x: 0, y: 0 }, 0)
  }
  return { configuration: next, fit, scale, offset, from, to, notes }
}

export function scaleWidgetPixels(widget: WidgetConfiguration, scale: Scale): void {
  scaleWidgetFields(widget, scale)
  repairArcThickness(widget)
  repairFrameInset(widget)
  for (const children of childArraysOf(widget)) {
    for (const child of children) {
      scalePlacement(child.placement, scale, NO_SHIFT)
      scaleWidgetPixels(child, scale)
    }
  }
}

const NO_SHIFT = { x: 0, y: 0 }

function isOffDisplay(
  absolute: { x: number; y: number },
  box: WidgetPlacement,
  display: DisplaySize
): boolean {
  const width = box.width ?? 0
  const height = box.height ?? 0
  return (
    absolute.x + width <= 0 ||
    absolute.y + height <= 0 ||
    absolute.x >= display.width ||
    absolute.y >= display.height
  )
}

function scalePlacement(
  placement: WidgetPlacement | undefined,
  scale: Scale,
  shift: { x: number; y: number }
): void {
  if (!placement) return
  scaleAxis(placement, 'x', 'width', scale.x, shift.x)
  scaleAxis(placement, 'y', 'height', scale.y, shift.y)
}

function noteImageResize(
  widget: WidgetConfiguration,
  before: DisplaySize | undefined,
  label: { screenIndex: number; widgetId?: string; widgetType: WidgetType },
  note: (entry: LayoutTransferNote) => void
): void {
  if (widget.type !== 'image' || !widget.image) return
  const after = placementSize(widget.placement)
  if (!before || !after) return
  if (before.width === after.width && before.height === after.height) return
  note({ kind: 'image_resize_required', ...label, imageId: widget.image, size: after })
}

function placementSize(placement: WidgetPlacement | undefined): DisplaySize | undefined {
  const width = placement?.width
  const height = placement?.height
  if (typeof width !== 'number' || typeof height !== 'number') return undefined
  return { width, height }
}
