import { create } from 'zustand'

import {
  allWidgetsOf,
  createWidgetId,
  screensOf,
  widgetsOf
} from '../../../../shared/configuration-access'
import {
  MAXIMUM_ARC_WIDGETS,
  MAXIMUM_BAR_WIDGETS,
  MAXIMUM_GRAPH_WIDGETS,
  MAXIMUM_IMAGE_WIDGETS,
  MAXIMUM_INDICATOR_WIDGETS,
  MAXIMUM_SHAPE_WIDGETS,
  MAXIMUM_TEXT_WIDGETS,
  MAXIMUM_WIDGETS_PER_SCREEN,
  WIDGET_ID_CAPACITY
} from '../../../../shared/configuration-schema'
import type {
  FontSpec,
  ScreenConfiguration,
  WidgetConfiguration,
  WidgetPlacement
} from '../../../../shared/configuration-schema'
import { validateConfigurationDocument } from '../../../../shared/configuration-validate'
import { BOARD_PROFILES } from '../../../../shared/device'
import type { DeviceConfiguration } from '../../../../shared/device'
import { useDeviceStore } from '@/features/device/device-store'

export {
  MAXIMUM_ARC_WIDGETS,
  MAXIMUM_BAR_WIDGETS,
  MAXIMUM_GRAPH_WIDGETS,
  MAXIMUM_IMAGE_WIDGETS,
  MAXIMUM_INDICATOR_WIDGETS,
  MAXIMUM_SHAPE_WIDGETS,
  MAXIMUM_TEXT_WIDGETS
}

// Selection addresses a widget by its stable id. Index-based selection silently
// retargeted to a different widget whenever a sibling was deleted or reordered.
export type WidgetSelection =
  | { type: 'screen' }
  | { type: 'widget'; id: string }

/**
 * How the canvas is being looked at, and which widgets are set aside while
 * working. None of this belongs in the document: the device would reject the
 * unknown properties, and a grid or a locked layer is a fact about the editing
 * session rather than about the dashboard.
 */
export interface EditorView {
  zoom: number
  panX: number
  panY: number
  gridSize: number
  snapToGrid: boolean
}

/**
 * What the canvas draws in place of telemetry. The configurator never receives
 * any: the control protocol has no command for it and the port belongs to
 * SimHub while a session is running, so `values` plays a synthetic lap
 * generated in the renderer.
 *
 * `unavailable` is not the same as `placeholders`: it is what the dashboard
 * looks like when the game stops sending, which is the state `unavailable_text`
 * and a hiding rule exist for, and which the live mode would otherwise make
 * impossible to see.
 */
export type PreviewValueMode = 'placeholders' | 'values' | 'unavailable'

export interface PreviewPlayback {
  mode: PreviewValueMode
  playing: boolean
  /** Position in the synthetic lap, 0 to 1. */
  phase: number
}

export const DEFAULT_PREVIEW_PLAYBACK: PreviewPlayback = {
  mode: 'placeholders',
  playing: true,
  phase: 0
}

export const DEFAULT_EDITOR_VIEW: EditorView = {
  zoom: 1,
  panX: 0,
  panY: 0,
  gridSize: 8,
  snapToGrid: false
}

export const MINIMUM_ZOOM = 1
export const MAXIMUM_ZOOM = 8

interface DashboardEditorStore {
  /**
   * The widget the inspector edits. Always the most recently picked member of
   * `selectedIds`, so single-widget editing and multi-widget arrangement read
   * the same selection from two angles instead of keeping two of them.
   */
  selection?: WidgetSelection
  selectedIds: string[]
  view: EditorView
  preview: PreviewPlayback
  /** Editor-only, keyed by widget id: neither reaches the document. */
  locked: Record<string, boolean>
  hidden: Record<string, boolean>
  select: (selection?: WidgetSelection) => void
  /** Adds or removes one widget, keeping it primary when it stays selected. */
  extendSelection: (id: string) => void
  selectMany: (ids: readonly string[]) => void
  setView: (patch: Partial<EditorView>) => void
  setPreview: (patch: Partial<PreviewPlayback>) => void
  toggleLocked: (id: string) => void
  toggleHidden: (id: string) => void
  resetEditorState: () => void
}

export const useDashboardEditorStore = create<DashboardEditorStore>((set) => ({
  selectedIds: [],
  view: DEFAULT_EDITOR_VIEW,
  preview: DEFAULT_PREVIEW_PLAYBACK,
  locked: {},
  hidden: {},
  select: (selection) =>
    set({
      selection,
      selectedIds: selection?.type === 'widget' ? [selection.id] : []
    }),
  extendSelection: (id) =>
    set((current) => {
      const selected = current.selectedIds.includes(id)
      const ids = selected
        ? current.selectedIds.filter((entry) => entry !== id)
        : [...current.selectedIds, id]
      const primary = ids[ids.length - 1]
      return {
        selectedIds: ids,
        selection: primary === undefined ? undefined : { type: 'widget', id: primary }
      }
    }),
  selectMany: (ids) =>
    set({
      selectedIds: [...ids],
      selection:
        ids.length === 0 ? { type: 'screen' } : { type: 'widget', id: ids[ids.length - 1]! }
    }),
  setView: (patch) => set((current) => ({ view: { ...current.view, ...patch } })),
  setPreview: (patch) => set((current) => ({ preview: { ...current.preview, ...patch } })),
  toggleLocked: (id) =>
    set((current) => ({ locked: { ...current.locked, [id]: !current.locked[id] } })),
  toggleHidden: (id) =>
    set((current) => ({ hidden: { ...current.hidden, [id]: !current.hidden[id] } })),
  // A different document is a different set of widgets, so what was locked,
  // hidden or selected in the previous one describes nothing.
  resetEditorState: () =>
    set({
      selection: undefined,
      selectedIds: [],
      locked: {},
      hidden: {},
      view: DEFAULT_EDITOR_VIEW,
      preview: DEFAULT_PREVIEW_PLAYBACK
    })
}))

export interface WidgetLocation {
  screenIndex: number
  widgetIndex: number
  widget: WidgetConfiguration
}

export function activeScreen(
  configuration: DeviceConfiguration | undefined
): ScreenConfiguration | undefined {
  return screensOf(configuration)[0]
}

export function findWidget(
  configuration: DeviceConfiguration | undefined,
  id: string
): WidgetLocation | undefined {
  const screens = screensOf(configuration)
  for (let screenIndex = 0; screenIndex < screens.length; ++screenIndex) {
    const widgets = widgetsOf(screens[screenIndex])
    const widgetIndex = widgets.findIndex((widget) => widget.id === id)
    const widget = widgets[widgetIndex]
    if (widgetIndex >= 0 && widget) {
      return { screenIndex, widgetIndex, widget }
    }
  }
  return undefined
}

export function selectedWidget(
  configuration: DeviceConfiguration | undefined,
  selection: WidgetSelection | undefined
): WidgetConfiguration | undefined {
  if (!selection || selection.type === 'screen') return undefined
  return findWidget(configuration, selection.id)?.widget
}

/**
 * The single funnel for every structured edit. The mutation runs against a
 * clone so the store always receives a new document, which keeps React updates
 * and any future history snapshot honest.
 */
export function mutateDraftConfiguration(
  mutation: (configuration: DeviceConfiguration) => void
): void {
  const store = useDeviceStore.getState()
  if (!store.draft) return
  const next = structuredClone(store.draft)
  mutation(next)
  store.setDraft(next)
}

export function mutateSelectedWidget(
  selection: WidgetSelection,
  mutation: (widget: WidgetConfiguration, configuration: DeviceConfiguration) => void
): void {
  if (selection.type !== 'widget') return
  mutateDraftConfiguration((configuration) => {
    const location = findWidget(configuration, selection.id)
    if (location) mutation(location.widget, configuration)
  })
}

export function mutateActiveScreen(
  mutation: (screen: ScreenConfiguration, configuration: DeviceConfiguration) => void
): void {
  mutateDraftConfiguration((configuration) => {
    const screen = ensureScreen(configuration)
    mutation(screen, configuration)
  })
}

/** Returns the first screen, creating the dashboard section if it is absent. */
function ensureScreen(configuration: DeviceConfiguration): ScreenConfiguration {
  const dashboard = (configuration.dashboard ??= {})
  const screens = (dashboard.screens ??= [])
  const existing = screens[0]
  if (existing) return existing
  const created: ScreenConfiguration = { id: 'screen1' }
  screens.push(created)
  return created
}

// Widget storage is a dashboard-wide pool, so a per-type cap is a budget across
// every screen rather than a per-screen allowance.
const WIDGET_CAPACITIES: Record<WidgetConfiguration['type'], number> = {
  text: MAXIMUM_TEXT_WIDGETS,
  shape: MAXIMUM_SHAPE_WIDGETS,
  bar: MAXIMUM_BAR_WIDGETS,
  arc: MAXIMUM_ARC_WIDGETS,
  indicator: MAXIMUM_INDICATOR_WIDGETS,
  graph: MAXIMUM_GRAPH_WIDGETS,
  image: MAXIMUM_IMAGE_WIDGETS
}

/**
 * The single insertion path: adding, duplicating and pasting all land here, so
 * a new widget cannot skip a cap check or reuse an id. The widget is inserted
 * as given apart from its id, which is always fresh.
 */
function insertWidget(
  configuration: DeviceConfiguration,
  widget: WidgetConfiguration
): WidgetSelection | undefined {
  const screen = ensureScreen(configuration)
  const widgets = (screen.widgets ??= [])
  const pooled = allWidgetsOf(configuration).filter(({ type }) => type === widget.type).length
  if (
    pooled >= WIDGET_CAPACITIES[widget.type] ||
    widgets.length >= MAXIMUM_WIDGETS_PER_SCREEN
  ) {
    return undefined
  }
  const id = createWidgetId()
  widgets.push({ ...widget, id })
  return { type: 'widget', id }
}

// The device rasterizes any size from an installed family, so a new widget
// picks a readable size rather than inheriting one that happens to be installed.
export const DEFAULT_WIDGET_FONT_SIZE_PX = 24

// A widget with no font is rejected by the device as a whole-document error,
// so a newly added one adopts an installed family when the board has any.
// Without fonts installed it is created bare and the validator explains why.
export function addTextWidget(
  display: { width: number; height: number },
  font?: FontSpec
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, {
      type: 'text',
      // A text widget renders its sources, so it always has at least one. The
      // empty source takes the schema default binding.
      sources: [{}],
      ...(font ? { value: { font } } : {}),
      placement: centeredPlacement(display, 120, 64)
    })
  })
  return added
}

export function addShapeWidget(
  display: { width: number; height: number }
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, {
      type: 'shape',
      // A shape with nothing painted would be invisible, so it starts as a
      // visible plate the author can restyle.
      background_color: '#1E293B',
      placement: centeredPlacement(display, 160, 80)
    })
  })
  return added
}

export function addBarWidget(
  display: { width: number; height: number }
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, {
      type: 'bar',
      // The frame background is the track the fill runs over, so a new bar
      // starts with one; the default 0..1 window suits a normalized source.
      background_color: '#1E293B',
      source: { binding: 'vehicle.throttle' },
      placement: centeredPlacement(display, 200, 24)
    })
  })
  return added
}

export function addArcWidget(
  display: { width: number; height: number }
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, {
      type: 'arc',
      source: { binding: 'engine.rpm_percent' },
      // A visible track is what makes an empty gauge read as a gauge.
      track_color: '#1E293B',
      placement: centeredPlacement(display, 120, 120)
    })
  })
  return added
}

export function addIndicatorWidget(
  display: { width: number; height: number }
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, {
      type: 'indicator',
      source: { binding: 'engine.rpm_percent' },
      off_color: '#1E293B',
      // The shift-light ladder every rev strip starts from: green, amber, red.
      segments: [
        { threshold: 0.5, color: '#00C853' },
        { threshold: 0.62, color: '#00C853' },
        { threshold: 0.74, color: '#FFD200' },
        { threshold: 0.84, color: '#FFD200' },
        { threshold: 0.92, color: '#D50000' },
        { threshold: 0.97, color: '#D50000' }
      ],
      placement: centeredPlacement(display, 240, 20)
    })
  })
  return added
}

export function addImageWidget(
  display: { width: number; height: number },
  image?: string
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, {
      type: 'image',
      // The device draws an image at the size it was uploaded at, so a new
      // widget starts at that size when one is installed.
      ...(image ? { image } : {}),
      placement: centeredPlacement(display, 96, 96)
    })
  })
  return added
}

export function addGraphWidget(
  display: { width: number; height: number }
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, {
      type: 'graph',
      source: { binding: 'vehicle.speed' },
      background_color: '#1E293B',
      placement: centeredPlacement(display, 200, 80)
    })
  })
  return added
}

function centeredPlacement(
  display: { width: number; height: number },
  preferredWidth: number,
  preferredHeight: number
): WidgetPlacement {
  const width = Math.min(preferredWidth, display.width)
  const height = Math.min(preferredHeight, display.height)
  return {
    x: Math.floor((display.width - width) / 2),
    y: Math.floor((display.height - height) / 2),
    width,
    height
  }
}

export function deleteWidget(selection: WidgetSelection): boolean {
  if (selection.type !== 'widget') return false
  let deleted = false
  mutateDraftConfiguration((configuration) => {
    const location = findWidget(configuration, selection.id)
    if (!location) return
    const screen = configuration.dashboard?.screens?.[location.screenIndex]
    if (!screen?.widgets) return
    screen.widgets.splice(location.widgetIndex, 1)
    deleted = true
    if (screen.widgets.length === 0) delete screen.widgets
  })
  return deleted
}

/**
 * Offsetting the copy is what makes it visible: an exact overlay looks like
 * nothing happened. The offset is clamped so a widget duplicated at the edge
 * stays on the display.
 */
const DUPLICATE_OFFSET_PX = 8

export function duplicateWidget(
  selection: WidgetSelection,
  display: { width: number; height: number }
): WidgetSelection | undefined {
  if (selection.type !== 'widget') return undefined
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    const source = findWidget(configuration, selection.id)?.widget
    if (!source) return
    added = insertWidget(configuration, offsetWidget(source, display))
  })
  return added
}

function offsetWidget(
  widget: WidgetConfiguration,
  display: { width: number; height: number }
): WidgetConfiguration {
  const placement = completePlacement(widget.placement)
  if (!placement) return structuredClone(widget)
  return {
    ...structuredClone(widget),
    placement: {
      ...placement,
      x: Math.min(placement.x + DUPLICATE_OFFSET_PX, display.width - placement.width),
      y: Math.min(placement.y + DUPLICATE_OFFSET_PX, display.height - placement.height)
    }
  }
}

// A widget copied out of one project has to be pasteable into another, so the
// clipboard carries the widget as JSON text rather than a live object. The
// in-memory copy is the fallback for the packaged app, where reading the system
// clipboard is not guaranteed.
let internalClipboard: WidgetConfiguration | undefined

export async function copyWidget(
  configuration: DeviceConfiguration | undefined,
  selection: WidgetSelection | undefined
): Promise<boolean> {
  const widget = selectedWidget(configuration, selection)
  if (!widget) return false
  internalClipboard = structuredClone(widget)
  try {
    await navigator.clipboard.writeText(JSON.stringify(widget, null, 2))
  } catch {
    // A denied or unavailable system clipboard still leaves the in-app copy.
  }
  return true
}

export async function pasteWidget(
  display: { width: number; height: number }
): Promise<WidgetSelection | undefined> {
  const widget = (await clipboardWidget()) ?? internalClipboard
  if (!widget) return undefined
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    added = insertWidget(configuration, offsetWidget(widget, display))
  })
  return added
}

async function clipboardWidget(): Promise<WidgetConfiguration | undefined> {
  try {
    const text = await navigator.clipboard.readText()
    const value: unknown = JSON.parse(text)
    return isPasteableWidget(value) ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * A pasted fragment is untrusted text, so it goes through the same validator
 * the device payload does — wrapped in the smallest document that can carry it.
 * That checks the discriminator and every property against the generated
 * allow-list, so a fragment from an older schema is rejected here rather than
 * by the board.
 */
function isPasteableWidget(value: unknown): value is WidgetConfiguration {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const board = useDeviceStore.getState().draft?.board
  if (!board) return false
  const probe = {
    board,
    dashboard: { screens: [{ widgets: [value] }] }
  }
  return validateConfigurationDocument(probe, {
    supportedBoards: Object.keys(BOARD_PROFILES)
  }).ok
}

export type AlignmentEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type DistributionAxis = 'horizontal' | 'vertical'

/**
 * Aligns every selected widget to the extreme of the group. Alignment reads the
 * group's own bounds rather than the display's, so aligning three readouts left
 * lines them up with the leftmost of the three, not with the screen edge.
 */
export function alignWidgets(ids: readonly string[], edge: AlignmentEdge): void {
  if (ids.length < 2) return
  mutateDraftConfiguration((configuration) => {
    const placed = selectedPlacements(configuration, ids)
    if (placed.length < 2) return
    const left = Math.min(...placed.map(({ placement }) => placement.x))
    const right = Math.max(...placed.map(({ placement }) => placement.x + placement.width))
    const top = Math.min(...placed.map(({ placement }) => placement.y))
    const bottom = Math.max(...placed.map(({ placement }) => placement.y + placement.height))
    for (const { widget, placement } of placed) {
      const next = { ...placement }
      if (edge === 'left') next.x = left
      else if (edge === 'right') next.x = right - placement.width
      else if (edge === 'center') next.x = Math.round((left + right - placement.width) / 2)
      else if (edge === 'top') next.y = top
      else if (edge === 'bottom') next.y = bottom - placement.height
      else next.y = Math.round((top + bottom - placement.height) / 2)
      widget.placement = next
    }
  })
}

/**
 * Spreads the widgets between the two outermost ones so the gaps between them
 * are equal. The ends stay where they are, which is what makes the result
 * predictable: distributing twice changes nothing.
 */
export function distributeWidgets(ids: readonly string[], axis: DistributionAxis): void {
  if (ids.length < 3) return
  mutateDraftConfiguration((configuration) => {
    const placed = selectedPlacements(configuration, ids)
    if (placed.length < 3) return
    const horizontal = axis === 'horizontal'
    const ordered = [...placed].sort((left, right) =>
      horizontal ? left.placement.x - right.placement.x : left.placement.y - right.placement.y
    )
    const first = ordered[0]!.placement
    const last = ordered[ordered.length - 1]!.placement
    const span = horizontal
      ? last.x + last.width - first.x
      : last.y + last.height - first.y
    const occupied = ordered.reduce(
      (total, { placement }) => total + (horizontal ? placement.width : placement.height),
      0
    )
    const gap = (span - occupied) / (ordered.length - 1)
    let cursor = horizontal ? first.x : first.y
    for (const { widget, placement } of ordered) {
      widget.placement = horizontal
        ? { ...placement, x: Math.round(cursor) }
        : { ...placement, y: Math.round(cursor) }
      cursor += (horizontal ? placement.width : placement.height) + gap
    }
  })
}

function selectedPlacements(
  configuration: DeviceConfiguration,
  ids: readonly string[]
): { widget: WidgetConfiguration; placement: Required<WidgetPlacement> }[] {
  const placed: { widget: WidgetConfiguration; placement: Required<WidgetPlacement> }[] = []
  for (const id of ids) {
    const widget = findWidget(configuration, id)?.widget
    const placement = completePlacement(widget?.placement)
    if (widget && placement) placed.push({ widget, placement })
  }
  return placed
}

/**
 * Rewrites `z_index` so the widgets stack in the given order, back to front.
 * Writing every index rather than only the moved one keeps the stack readable
 * in the JSON editor and leaves no ties for the authored order to break.
 */
export function reorderWidgets(orderedIds: readonly string[]): void {
  mutateDraftConfiguration((configuration) => {
    orderedIds.forEach((id, index) => {
      const widget = findWidget(configuration, id)?.widget
      if (widget) widget.z_index = index
    })
  })
}

/**
 * Renames a widget. The id is the widget's name in the document — it is never
 * drawn, unlike the caption — so the layer list edits it directly. A duplicate
 * or an oversized name is refused rather than silently adjusted, because the
 * device stores 15 bytes and rejects a document with a longer one.
 */
export function renameWidget(id: string, name: string): boolean {
  const trimmed = name.trim()
  const configuration = useDeviceStore.getState().draft
  if (!configuration || trimmed.length === 0 || trimmed === id) return false
  if (new TextEncoder().encode(trimmed).byteLength >= WIDGET_ID_CAPACITY) return false
  if (allWidgetsOf(configuration).some((widget) => widget.id === trimmed)) return false
  mutateDraftConfiguration((next) => {
    const widget = findWidget(next, id)?.widget
    if (widget) widget.id = trimmed
  })
  const editor = useDashboardEditorStore.getState()
  editor.selectMany(editor.selectedIds.map((entry) => (entry === id ? trimmed : entry)))
  return true
}

export function completePlacement(
  placement: WidgetPlacement | undefined
): Required<WidgetPlacement> | undefined {
  if (
    !placement ||
    !Number.isFinite(placement.x) ||
    !Number.isFinite(placement.y) ||
    !Number.isFinite(placement.width) ||
    !Number.isFinite(placement.height) ||
    (placement.width ?? 0) <= 0 ||
    (placement.height ?? 0) <= 0
  ) {
    return undefined
  }
  return placement as Required<WidgetPlacement>
}
