import { useEffect, useMemo, useRef, useState } from 'react'
import { childArraysOf, descendantsOf, isContainer, pagesOf, screensOf, widgetsOf } from '@shared/configuration-access'
import { type DeviceConfiguration, type DisplayDescriptor } from '@shared/device'
import { clamp } from '../editor/placement'
import { isTextEntry } from '../editor/keyboard'
import { GapOverlay, GridOverlay, GuideOverlay, HitArea, MeasureBadge, SelectionFrame, TargetOutline } from './CanvasOverlays'
import { CanvasContextMenu } from './ContextMenu'
import { moveSelection, scaleWidgets, type ScaleSubject } from '../editor/geometry-commands'
import { flattenScreen } from './preview-layers'
import { MAXIMUM_ZOOM, MINIMUM_ZOOM, type WidgetSelection, absolutePlacement, absolutePlacements, ancestorsOf, completePlacement, findWidget, moveWidgetInto, parentContainerId, selectionTarget, useDashboardEditorStore } from '../dashboard-editor'
import { type Draw, type Follower, type Interaction, type InteractionMode, type Marquee, type Pan, type Placement, type PreviewLayer, actionLabel, clampPan, containerAt, containerClipId, intersection, intersects, logicalPoint, marqueeBounds, viewportScale, visibleSlotPage, widgetClipId } from './canvas-geometry'
import type { PendingInsert } from '../editor/store'
import { contentArea } from './preview-geometry-paint'
import { SCREEN_BACKGROUND } from './preview-theme'
import { createPreviewValues } from './preview-values'
import { resolveGridSize, useSnapStore } from '../editor/snap-store'
import { type GapLabel, type SnapField, type SnapGuide, type SnapMode, type SnapPreferences, resolveMove, resolveResize, snapPoint } from './snapping'
import { createWidget, defaultToolBox } from './widget-creation'
import { fitWidgetToDisplay, placeTemplateWidget } from '../editor/insert-template'
import { WidgetBody } from './WidgetBody'
import { WidgetLayers } from './WidgetLayers'
import { useDeviceStore } from '@/features/device/device-store'

/** What the canvas is telling the author while a gesture runs. */
interface Feedback {
  guides: SnapGuide[]
  gaps: GapLabel[]
  highlighted: string[]
  badge?: { placement: Placement; mode: 'move' | 'resize' }
}

const NO_FEEDBACK: Feedback = { guides: [], gaps: [], highlighted: [] }

/**
 * What the held modifiers leave of the snapping. Nothing else in the editor
 * reads them this way, so the rule is stated once: the accelerator drops the
 * neighbours and keeps the grid — the same key that already means "leave this
 * widget where it is, in the container it is in" — and adding Shift drops the
 * grid as well, which is the escape hatch for a value the author means exactly.
 */
function snapMode(event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }): SnapMode {
  if (!event.metaKey && !event.ctrlKey) return 'all'
  return event.shiftKey ? 'none' : 'grid'
}

export function Widgets({
  configuration,
  display
}: {
  configuration: DeviceConfiguration
  display: DisplayDescriptor
}): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const selection = useDashboardEditorStore((state) => state.selection)
  const selectedIds = useDashboardEditorStore((state) => state.selectedIds)
  const select = useDashboardEditorStore((state) => state.select)
  const extendSelection = useDashboardEditorStore((state) => state.extendSelection)
  const selectMany = useDashboardEditorStore((state) => state.selectMany)
  const activeScreenIndex = useDashboardEditorStore((state) => state.activeScreenIndex)
  const slotPage = useDashboardEditorStore((state) => state.slotPage)
  const drillIn = useDashboardEditorStore((state) => state.drillIn)
  const setDrillIn = useDashboardEditorStore((state) => state.setDrillIn)
  const activeTool = useDashboardEditorStore((state) => state.activeTool)
  const setActiveTool = useDashboardEditorStore((state) => state.setActiveTool)
  const pendingInsert = useDashboardEditorStore((state) => state.pendingInsert)
  const cancelInsert = useDashboardEditorStore((state) => state.cancelInsert)
  const view = useDashboardEditorStore((state) => state.view)
  const locked = useDashboardEditorStore((state) => state.locked)
  const hidden = useDashboardEditorStore((state) => state.hidden)
  const snap = useSnapStore()
  const [interaction, setInteraction] = useState<Interaction>()
  const [draw, setDraw] = useState<Draw>()
  // The container the widget being dragged would join on release. Held while the
  // drag runs so the canvas can say where it is about to land, and recomputed
  // from the document at release rather than trusted, because this is a render
  // behind the pointer.
  const [dropContainer, setDropContainer] = useState<string>()
  const [marquee, setMarquee] = useState<Marquee>()
  const [pan, setPan] = useState<Pan>()
  const [feedback, setFeedback] = useState<Feedback>(NO_FEEDBACK)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    widgetId?: string
    /** Where on the display it was opened, which is where "Add" puts a widget. */
    at?: { x: number; y: number }
  }>()
  // Space is the pan key every canvas uses, and it has to be a held state
  // rather than a modifier on the event: the press happens before the drag.
  const [spaceHeld, setSpaceHeld] = useState(false)
  // Every reading is unavailable — the configurator receives no telemetry — so
  // this holds nothing and is built once rather than per frame.
  const values = createPreviewValues()
  // Every box in display coordinates, resolved in one walk. Asking per widget
  // costs two tree searches each, and this render asks for the selection, for
  // every widget carrying an action, for every layer it draws and again on
  // each pointer-down.
  const placements = useMemo(() => absolutePlacements(configuration), [configuration])
  const screen = screensOf(configuration)[activeScreenIndex]
  const screenBackground = screen?.background_color ?? SCREEN_BACKGROUND
  const layers: PreviewLayer[] = flattenScreen(screen, slotPage)
  const gridSize = resolveGridSize(snap, display)
  // What the canvas is actually showing, which is what a marquee may catch and
  // what a drag may snap to: a widget on a page nobody is looking at is not on
  // screen, so treating it as a target would select and align the invisible.
  const widgets = layers.map((layer) => layer.configuration)
  const selectedPlacements = selectedIds
    .map((id) => placements.get(id))
    .filter((placement): placement is Placement => placement !== undefined)
  // A container resizes like the widget it is: its box is the thing being
  // dragged, and its children keep the offsets they were authored with — unless
  // the author has asked for the contents to scale with it.
  const primaryPlacement =
    selection?.type === 'widget' ? placements.get(selection.id) : undefined
  // More than one widget is resized by the box around all of them, which is the
  // same gesture over a different rectangle.
  const groupPlacement = selectedPlacements.length > 1 ? unionOf(selectedPlacements) : undefined

  const preferences = (event: {
    metaKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
  }): SnapPreferences => ({
    grid: snap.snapToGrid ? gridSize : 0,
    // Snapping is in logical pixels, so the tolerance shrinks as the canvas is
    // magnified and stays the same distance under the pointer.
    tolerance: snap.tolerancePx / view.zoom,
    widgets: snap.snapToWidgets,
    spacing: snap.snapToSpacing,
    mode: snapMode(event)
  })

  /**
   * The level a gesture lines up within: the siblings of whichever container
   * holds the box, that container's own edges and the area inside its padding.
   *
   * A widget only ever lines up with what it lives beside. Treating the whole
   * screen as one field made a readout inside a panel snap to a readout in the
   * panel next door — two boxes that have nothing to do with each other and
   * that the author cannot see a relationship between.
   */
  const snapField = (levelId: string | undefined, excluded: ReadonlySet<string>): SnapField => {
    const siblings = layers
      .filter((layer) => layer.parentId === levelId)
      .map((layer) => layer.configuration.id)
      .filter((id): id is string => id !== undefined && !excluded.has(id) && !hidden[id])
      .map((id) => ({ id, box: placements.get(id) }))
      .filter((entry): entry is { id: string; box: Placement } => entry.box !== undefined)
    const container = levelId === undefined ? undefined : findWidget(configuration, levelId)?.widget
    const bounds = levelId === undefined ? undefined : placements.get(levelId)
    if (!container || !bounds) {
      return {
        siblings,
        bounds: { x: 0, y: 0, width: display.width, height: display.height }
      }
    }
    return {
      siblings,
      bounds,
      inner: contentArea(bounds, container.border?.width_px ?? 0, container.padding)
    }
  }

  /** A widget, everything inside it, and everything moving with it. */
  const excludedFrom = (movedId: string, followers: readonly Follower[]): Set<string> => {
    const widget = findWidget(useDeviceStore.getState().draft, movedId)?.widget
    const excluded = new Set(
      (widget ? descendantsOf(widget) : [])
        .map((entry) => entry.id)
        .filter((entry): entry is string => entry !== undefined)
    )
    excluded.add(movedId)
    for (const follower of followers) excluded.add(follower.id)
    return excluded
  }

  const beginInteraction = (
    event: React.PointerEvent<SVGElement>,
    target: WidgetSelection,
    mode: InteractionMode,
    placement: Placement
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    if (target.type === 'widget' && event.shiftKey && mode === 'move') {
      extendSelection(target.id)
      return
    }
    // Dragging one of several selected widgets moves the group; dragging an
    // unselected one starts a new selection, which is what a click on it means.
    const group =
      target.type === 'widget' && selectedIds.includes(target.id)
        ? selectedIds
        : (select(target), target.type === 'widget' ? [target.id] : [])
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    if (!point) return
    svgRef.current?.setPointerCapture(event.pointerId)
    // One commit per frame is still one gesture, so the whole drag collapses
    // into a single history entry.
    useDeviceStore.getState().beginEdit()
    const primaryId = target.type === 'widget' ? target.id : ''
    setInteraction({
      pointerId: event.pointerId,
      target,
      mode,
      start: point,
      placement,
      level: parentContainerId(configuration, target),
      followers:
        mode === 'move'
          ? group
              .filter((id) => id !== primaryId)
              .map((id) => ({ id, placement: placements.get(id) }))
              .filter((entry): entry is Follower => entry.placement !== undefined)
          : [],
      subjects: mode === 'move' ? [] : resizeSubjects(group.length > 1 ? group : [primaryId])
    })
  }

  /**
   * What a resize will rewrite, snapshotted before the first frame. A widget
   * inside another selected widget is left out: it would be scaled once by its
   * own entry and again by its container's, and compound.
   */
  const resizeSubjects = (ids: readonly string[]): ScaleSubject[] => {
    const draft = useDeviceStore.getState().draft
    const chosen = new Set(ids)
    return ids
      .map((id) => {
        const location = findWidget(draft, id)
        const box = placements.get(id)
        if (!location || !box) return undefined
        const inherited = ancestorsOf(draft, location).some(
          (ancestor) => ancestor.id !== undefined && chosen.has(ancestor.id)
        )
        if (inherited) return undefined
        return {
          id,
          original: JSON.parse(JSON.stringify(location.widget)) as ScaleSubject['original'],
          box
        }
      })
      .filter((subject): subject is ScaleSubject => subject !== undefined)
  }

  // A pointer stream can outpace the frame rate, and each commit rewrites the
  // whole document. Coalescing to one commit per frame keeps dragging smooth.
  //
  // The coalesced work is kept beside its frame id so releasing the pointer can
  // run it rather than drop it. Cancelling the frame alone loses everything
  // between the last painted frame and the release — a slow drag gave up a few
  // pixels, and a quick one gave up the whole gesture.
  const pendingFrame = useRef<number | undefined>(undefined)
  const pendingCommit = useRef<(() => void) | undefined>(undefined)
  const flushPendingCommit = (): void => {
    if (pendingFrame.current !== undefined) {
      cancelAnimationFrame(pendingFrame.current)
      pendingFrame.current = undefined
    }
    const commit = pendingCommit.current
    pendingCommit.current = undefined
    commit?.()
  }
  useEffect(() => () => {
    if (pendingFrame.current !== undefined) cancelAnimationFrame(pendingFrame.current)
    pendingCommit.current = undefined
  }, [])

  // Space pans, so the canvas has to know it is held before anything is
  // dragged. Left alone while a field has focus, where a space is a space.
  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || isTextEntry(event.target)) return
      event.preventDefault()
      setSpaceHeld(true)
    }
    const up = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    // A window that loses focus mid-press never sees the release.
    const clear = (): void => setSpaceHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  // Wheel handling is a native listener rather than a React prop because it has
  // to be able to refuse the browser's own zoom and scroll, and React registers
  // wheel passively at the root, where preventDefault does nothing.
  useEffect(() => {
    const element = svgRef.current
    if (!element) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const store = useDashboardEditorStore.getState()
      const current = store.view
      if (event.ctrlKey || event.metaKey) {
        const point = logicalPoint(element, event.clientX, event.clientY)
        const zoom = clamp(
          current.zoom * (event.deltaY < 0 ? 1.25 : 0.8),
          MINIMUM_ZOOM,
          MAXIMUM_ZOOM
        )
        if (!point) {
          store.setView({ zoom, ...clampPan(current, display, zoom) })
          return
        }
        // Zooming at the pointer keeps whatever is under it under it, which is
        // what makes magnifying a corner of the display usable at all.
        store.setView({
          zoom,
          ...clampPan(
            {
              panX: point.x - (point.x - current.panX) * (current.zoom / zoom),
              panY: point.y - (point.y - current.panY) * (current.zoom / zoom)
            },
            display,
            zoom
          )
        })
        return
      }
      const scale = viewportScale(element, display, current.zoom)
      store.setView(
        clampPan(
          {
            panX: current.panX + event.deltaX / scale,
            panY: current.panY + event.deltaY / scale
          },
          display,
          current.zoom
        )
      )
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [display])

  /**
   * The container a dragged widget would join, resolved against the document as
   * it stands. A widget cannot land in itself or in anything it holds, and a
   * group drag lands nowhere: reparenting only the widget under the pointer
   * would split the selection across two boxes.
   */
  const dropTargetFor = (
    box: Placement | undefined,
    excluded: ReadonlySet<string>,
    followers: number
  ): string | undefined => {
    if (!box || followers > 0) return undefined
    return containerAt(layers, placements, box, excluded, locked, hidden)
  }

  // Where the widget waiting to be placed currently sits, tagged with the
  // insert it belongs to. Undefined until the pointer has been over the display:
  // a ghost drawn at a guessed position before the author has moved is a ghost
  // in the wrong place, and carrying the insert is what makes the position from
  // the *previous* one fail to match rather than linger.
  const [ghost, setGhost] = useState<{ insert: PendingInsert; x: number; y: number }>()
  const insertAt = ghost && ghost.insert === pendingInsert ? ghost : undefined
  const fittedInsert = pendingInsert
    ? fitWidgetToDisplay(pendingInsert.widget, display)
    : undefined

  // A press anywhere outside the display gives up on the insert, and so does
  // Escape. Both are capture-phase, so neither reaches whatever they landed on.
  useEffect(() => {
    if (!pendingInsert) return
    const away = (event: PointerEvent): void => {
      if (!svgRef.current?.contains(event.target as Node)) cancelInsert()
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      cancelInsert()
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [pendingInsert, cancelInsert])

  const placePendingInsert = (event: React.PointerEvent<SVGSVGElement>): boolean => {
    if (!pendingInsert || event.button !== 0) return false
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    if (!point) return false
    const added = placeTemplateWidget(pendingInsert, display, point)
    cancelInsert()
    // Selected on landing, so the inspector is already pointed at what was just
    // placed — the next thing an author does to a fragment is adjust it.
    if (added) select(added)
    return true
  }

  const movePointer = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (pendingInsert) {
      const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
      setGhost(point ? { insert: pendingInsert, ...point } : undefined)
    }
    if (pan && event.pointerId === pan.pointerId) {
      const scale = viewportScale(svgRef.current, display, view.zoom)
      useDashboardEditorStore.getState().setView(
        clampPan(
          {
            panX: pan.startPanX - (event.clientX - pan.startClientX) / scale,
            panY: pan.startPanY - (event.clientY - pan.startClientY) / scale
          },
          display,
          view.zoom
        )
      )
      return
    }
    if (draw && event.pointerId === draw.pointerId) {
      const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
      if (!point) return
      const corner = snapPoint(point, snapField(drawLevel(draw), new Set()), display, preferences(event))
      setDraw({ ...draw, current: corner })
      const box = drawnBox(draw.start, corner)
      setFeedback({
        guides: corner.guides,
        gaps: [],
        highlighted: corner.highlighted,
        badge: { placement: box, mode: 'resize' }
      })
      return
    }
    if (marquee && event.pointerId === marquee.pointerId) {
      const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
      if (point) setMarquee({ ...marquee, current: point })
      return
    }
    if (!interaction || event.pointerId !== interaction.pointerId) return
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    if (!point) return
    const dx = point.x - interaction.start.x
    const dy = point.y - interaction.start.y
    const modifiers = {
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey
    }
    if (pendingFrame.current !== undefined) cancelAnimationFrame(pendingFrame.current)
    pendingCommit.current = () => {
      if (interaction.mode === 'move') commitMove(interaction, dx, dy, modifiers)
      else commitResize(interaction, dx, dy, modifiers)
    }
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = undefined
      const commit = pendingCommit.current
      pendingCommit.current = undefined
      commit?.()
    })
  }

  interface Modifiers {
    metaKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
    altKey: boolean
  }

  const commitMove = (
    gesture: Interaction,
    dx: number,
    dy: number,
    modifiers: Modifiers
  ): void => {
    const movedId = gesture.target.type === 'widget' ? gesture.target.id : ''
    const excluded = excludedFrom(movedId, gesture.followers)
    // ⌘/Ctrl means "ignore the containers" here as it does for selection, so
    // a widget can be parked over a plate without joining it.
    const keeping = modifiers.metaKey || modifiers.ctrlKey
    // Where the box is before anything snaps decides which container it is in,
    // and that container decides what it snaps to: the level answers on the
    // way in, so a widget dragged into a panel lines up with the panel's own
    // contents from the moment it is over them.
    const loose = {
      ...gesture.placement,
      x: gesture.placement.x + dx,
      y: gesture.placement.y + dy
    }
    // A group drag never reparents — moving only the widget under the pointer
    // would split the selection across two boxes — so it also never changes the
    // level it lines up within.
    const inside =
      keeping || gesture.followers.length > 0
        ? gesture.level
        : dropTargetFor(loose, excluded, gesture.followers.length)
    // Overhanging is not leaving — the same rule the release applies, so what
    // the drag lines up with is what the drop will land in.
    const parentBox = gesture.level === undefined ? undefined : placements.get(gesture.level)
    const overhangs =
      inside === undefined && parentBox !== undefined && intersects(loose, parentBox)
    const level = keeping || overhangs ? gesture.level : inside
    const resolved = resolveMove(
      gesture.placement,
      dx,
      dy,
      snapField(level, excluded),
      display,
      preferences(modifiers)
    )
    setFeedback({
      guides: resolved.guides,
      gaps: resolved.gaps,
      highlighted: resolved.highlighted,
      badge: { placement: resolved.placement, mode: 'move' }
    })
    setDropContainer(level === gesture.level ? undefined : level)
    moveSelection(
      movedId,
      resolved.placement,
      {
        x: resolved.placement.x - gesture.placement.x,
        y: resolved.placement.y - gesture.placement.y
      },
      gesture.followers,
      display
    )
  }

  const commitResize = (
    gesture: Interaction,
    dx: number,
    dy: number,
    modifiers: Modifiers
  ): void => {
    if (gesture.mode === 'move') return
    const excluded = new Set(gesture.subjects.map((subject) => subject.id))
    const resolved = resolveResize(
      gesture.placement,
      gesture.mode,
      dx,
      dy,
      snapField(gesture.level, excluded),
      display,
      preferences(modifiers),
      { proportional: modifiers.shiftKey, fromCenter: modifiers.altKey }
    )
    setFeedback({
      guides: resolved.guides,
      gaps: resolved.gaps,
      highlighted: resolved.highlighted,
      badge: { placement: resolved.placement, mode: 'resize' }
    })
    scaleWidgets(
      gesture.subjects,
      gesture.placement,
      resolved.placement,
      display,
      useSnapStore.getState().scaleContents
    )
  }

  /** The level a drawn box belongs to, which is where its corners line up. */
  const drawLevel = (pending: Draw): string | undefined => {
    const box = drawnBox(pending.start, pending.current)
    if (box.width < 1 || box.height < 1) return drillIn
    return containerAt(layers, placements, box, new Set(), locked, hidden)
  }

  const finishDraw = (pending: Draw): void => {
    const box = drawnBox(pending.start, pending.current)
    // A click rather than a drag is still a request for a widget: the kind's
    // own size, centred where the pointer went down.
    const drawn =
      box.width >= MINIMUM_DRAWN_PX && box.height >= MINIMUM_DRAWN_PX
        ? box
        : defaultToolBox(pending.tool, pending.start, display)
    const into = containerAt(layers, placements, drawn, new Set(), locked, hidden) ?? 'screen'
    const added = createWidget(pending.tool, display, { placement: drawn, into })
    if (added) select(added)
    // One-shot: the tool has done what it was picked for.
    setActiveTool('select')
  }

  const finishPointer = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (pan?.pointerId === event.pointerId) {
      svgRef.current?.releasePointerCapture(event.pointerId)
      setPan(undefined)
      return
    }
    if (draw?.pointerId === event.pointerId) {
      svgRef.current?.releasePointerCapture(event.pointerId)
      finishDraw(draw)
      setDraw(undefined)
      setFeedback(NO_FEEDBACK)
      return
    }
    if (marquee?.pointerId === event.pointerId) {
      svgRef.current?.releasePointerCapture(event.pointerId)
      const bounds = marqueeBounds(marquee)
      // A click rather than a drag: the screen is what was picked.
      if (bounds.width < 2 && bounds.height < 2) {
        if (!marquee.additive) select({ type: 'screen' })
      } else {
        const caught = widgets
          .filter((widget) => widget.id && !hidden[widget.id] && !locked[widget.id])
          .filter((widget) => {
            const placement = placements.get(widget.id as string)
            return placement !== undefined && intersects(placement, bounds)
          })
          .map((widget) => widget.id as string)
        selectMany(marquee.additive ? [...new Set([...selectedIds, ...caught])] : caught)
      }
      setMarquee(undefined)
      return
    }
    if (interaction?.pointerId !== event.pointerId) return
    svgRef.current?.releasePointerCapture(event.pointerId)
    // The last move may still be waiting for a frame; it has to land, and it
    // has to land inside the history group this gesture opened.
    flushPendingCommit()
    // Where the widget ended up decides what holds it: the innermost container
    // that contains it whole, or its screen when none does. Resolved from the
    // committed document rather than from the highlight, which is a render
    // behind, and run before endEdit so the move and the drag are one undo.
    if (interaction.mode === 'move' && interaction.target.type === 'widget' &&
        !event.metaKey && !event.ctrlKey) {
      const moved = interaction.target.id
      const draft = useDeviceStore.getState().draft
      const box = absolutePlacement(draft, moved)
      const landing = dropTargetFor(
        box,
        excludedFrom(moved, interaction.followers),
        interaction.followers.length
      )
      const parent = parentContainerId(draft, interaction.target)
      const parentBox = parent === undefined ? undefined : absolutePlacement(draft, parent)
      // Overhanging is not leaving. A widget that still touches its container
      // was nudged past its edge — which is exactly what `clip_children: false`
      // is authored for — so it keeps its parent; only one dragged clear of the
      // container altogether is released onto the screen.
      const overhangs =
        landing === undefined && box !== undefined && parentBox !== undefined &&
        intersects(box, parentBox)
      // Same parent is not a move either: dropping a widget back where it came
      // from would otherwise raise it to the top of its own container's stack.
      if (!overhangs && landing !== parent) {
        moveWidgetInto(moved, landing)
      }
    }
    useDeviceStore.getState().endEdit()
    setInteraction(undefined)
    setDropContainer(undefined)
    setFeedback(NO_FEEDBACK)
  }

  const beginBackground = (event: React.PointerEvent<SVGSVGElement>): void => {
    // The right button opens the menu; it must not start a gesture on the way.
    if (event.button === 2) return
    // A widget waiting to be placed owns the next press: no rubber band, no
    // tool, no selection.
    if (placePendingInsert(event)) return
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    if (!point) return
    svgRef.current?.setPointerCapture(event.pointerId)
    // The middle button pans, and so does Space — which leaves the left button
    // free for the rubber band even when the canvas is magnified.
    if (event.button === 1 || spaceHeld) {
      event.preventDefault()
      setPan({
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: view.panX,
        startPanY: view.panY
      })
      return
    }
    if (activeTool !== 'select') {
      const corner = snapPoint(point, snapField(drillIn, new Set()), display, preferences(event))
      setDraw({ pointerId: event.pointerId, tool: activeTool, start: corner, current: corner })
      return
    }
    setMarquee({
      pointerId: event.pointerId,
      start: point,
      current: point,
      additive: event.shiftKey
    })
  }

  const openMenu = (event: React.MouseEvent, widgetId?: string): void => {
    event.preventDefault()
    event.stopPropagation()
    // A menu acts on the selection, so a right-click on something unselected
    // picks it first — otherwise "Delete" would delete the wrong widget.
    if (widgetId && !selectedIds.includes(widgetId)) select({ type: 'widget', id: widgetId })
    if (!widgetId) select({ type: 'screen' })
    setMenu({
      x: event.clientX,
      y: event.clientY,
      widgetId,
      at: logicalPoint(svgRef.current, event.clientX, event.clientY)
    })
  }

  // Every tap target is a widget now — a container carries its action on the
  // frame like any other — so one pass collects them all in display coordinates.
  const tapTargets = layers
      .filter((layer) => layer.configuration.action?.type && layer.configuration.action.type !== 'none')
      .map((layer) => ({
        id: layer.configuration.id ?? '',
        placement: layer.configuration.id
          ? placements.get(layer.configuration.id)
          : undefined,
        label: actionLabel(layer.configuration.action)
      }))
  .filter(
    (entry): entry is { id: string; placement: Placement; label: string } =>
      entry.placement !== undefined
  )

  const viewWidth = display.width / view.zoom
  const viewHeight = display.height / view.zoom
  const band = marquee ? marqueeBounds(marquee) : undefined
  const drawing = draw ? drawnBox(draw.start, draw.current) : undefined
  const highlightedBoxes = feedback.highlighted
    .map((id) => placements.get(id))
    .filter((box): box is Placement => box !== undefined)

  // Working inside a slot means looking at its box, with the rest of the screen
  // still drawn around it for context but dimmed and inert — the page is the
  // only thing being authored, and a click landing outside it would be an edit
  // to something the author is not looking at.
  //
  // Only a slot. A page is one of several alternatives for a box, so isolating
  // it is honest; a container shape is an ordinary parent that draws alongside
  // everything else, and dimming the screen around it would say the rest had
  // stopped mattering. Opening one only changes what a click reaches.
  const openedWidget = drillIn ? findWidget(configuration, drillIn)?.widget : undefined
  const isolated = openedWidget?.type === 'slot' ? drillIn : undefined
  const openedIds = new Set(
    openedWidget?.type === 'slot'
      ? (() => {
          const page = pagesOf(openedWidget)[visibleSlotPage(openedWidget, slotPage)]
          return (page ? widgetsOf(page).flatMap((widget) => [widget, ...childArraysOf(widget).flat()]) : [])
            .map((widget) => widget.id)
            .filter((id): id is string => id !== undefined)
        })()
      : []
  )
  const dimmed = (layer: PreviewLayer): boolean =>
    isolated !== undefined &&
    layer.configuration.id !== isolated &&
    !openedIds.has(layer.configuration.id ?? '')

  return (
    <>
    <svg
      ref={svgRef}
      aria-label="Dashboard display preview"
      className={`block size-full touch-none select-none ${
        spaceHeld
          ? 'cursor-grab'
          : activeTool === 'select' && !pendingInsert
            ? ''
            : 'cursor-crosshair'
      }`}
      preserveAspectRatio="xMidYMid meet"
      viewBox={`${view.panX} ${view.panY} ${viewWidth} ${viewHeight}`}
      onPointerMove={movePointer}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onPointerDown={beginBackground}
      onContextMenu={(event) => openMenu(event)}
    >
      <rect width={display.width} height={display.height} fill={screenBackground} />
      {snap.snapToGrid ? <GridOverlay display={display} size={gridSize} zoom={view.zoom} /> : null}
      {/* A container is a visible widget with its own hit area, so all it needs
          here is a hint that it holds things — drawn under the widgets, and
          only on the outline so it never steals a click from a child. Reaching
          a full container is Escape, which walks up from whatever child was
          clicked; a child is drawn above its parent, so there is no point on it
          that a click could otherwise land on. */}
      {layers.map((layer) => {
        const widget = layer.configuration
        // A slot draws nothing at all, so its outline is not a hint but the only
        // thing that says where it is — an empty one still gets it. So does
        // every container while something is being dragged: an empty shape is
        // otherwise an invisible place to drop into.
        const empty = childArraysOf(widget).flat().length === 0
        if (widget.type !== 'slot' && empty && !((interaction || draw) && isContainer(widget))) {
          return null
        }
        const box = completePlacement(widget.placement)
        if (!box) return null
        const id = widget.id
        const picked = selection?.type === 'widget' && selection.id === id
        const landing = dropContainer !== undefined && dropContainer === id
        const stroke = widget.type === 'slot' ? '#38BDF8' : '#A78BFA'
        return (
          <rect
            key={`container-${id}`}
            x={box.x + layer.offsetX}
            y={box.y + layer.offsetY}
            width={box.width}
            height={box.height}
            fill="none"
            stroke={landing ? '#38F5A8' : picked || drillIn === id ? stroke : `${stroke}80`}
            strokeWidth={(landing ? 2 : 1) / view.zoom}
            // Solid says the drop lands here; dashed is only a hint that
            // something holds widgets.
            strokeDasharray={landing ? undefined : `${2 / view.zoom} ${4 / view.zoom}`}
            pointerEvents="none"
          />
        )
      })}
      {layers.map((layer, layerIndex) => {
        const id = layer.configuration.id
        if (id && hidden[id]) return null
        // Two clips, both the device's. The widget's own box clips its
        // contents, exactly as its LVGL container does — a value wider than its
        // widget is cut off on the board rather than spilling over its
        // neighbours — and its caption is left out of that one, because the
        // device puts the caption on the parent where it overhangs the frame.
        // The containers above it clip everything it draws, caption included,
        // which is what `clip_children` says. What is deliberately *not*
        // clipped is the hit area: a widget dragged out of a container would
        // otherwise be invisible and unselectable at once, with no way back.
        // The clip arrives in display coordinates and this group is already
        // translated by the container chain, so it is read back into local
        // space rather than the transform being undone around it. The widget's
        // own box is clipped inside WidgetBody, which knows it from the widget.
        const clip = layer.clip
          ? {
              ...layer.clip,
              x: layer.clip.x - layer.offsetX,
              y: layer.clip.y - layer.offsetY
            }
          : undefined
        const faded = dimmed(layer)
        return (
          <g
            key={id ?? layer.configurationOrder}
            opacity={faded ? 0.25 : undefined}
            pointerEvents={faded ? 'none' : undefined}
            transform={
              layer.offsetX || layer.offsetY
                ? `translate(${layer.offsetX} ${layer.offsetY})`
                : undefined
            }
            onContextMenu={(event) => {
              if (!id) return
              const target = selectionTarget(configuration, id, {
                entered: drillIn,
                deep: event.metaKey || event.ctrlKey,
                blocked: (candidate) => Boolean(locked[candidate])
              })
              if (target) openMenu(event, target)
            }}
            onPointerDown={(event) => {
            if (!id) return
            // A tool is drawing, and a press over a widget is where the author
            // wants the new one — not a request to pick what is underneath.
            if (activeTool !== 'select' || pendingInsert || spaceHeld || event.button === 1) return
            // The object under the pointer is the deepest one; which widget that
            // means is the container rule, not this handler's business.
            const target = selectionTarget(configuration, id, {
              entered: drillIn,
              deep: event.metaKey || event.ctrlKey,
              blocked: (candidate) => Boolean(locked[candidate])
            })
            const placement = target ? placements.get(target) : undefined
            if (!target || !placement) return
            beginInteraction(event, { type: 'widget', id: target }, 'move', placement)
          }}
            // Opening a container is what makes the level below it clickable —
            // a slot one page at a time inside its own box, a shape its
            // children. Double-click is how a container has always been opened.
            onDoubleClick={() => {
              if (!id) return
              const target = selectionTarget(configuration, id, { entered: drillIn })
              const opening = target ? findWidget(configuration, target)?.widget : undefined
              if (!target || !opening || !isContainer(opening)) return
              setDrillIn(target)
              // Land on what was actually double-clicked rather than on the
              // container just opened, which is where the click was aimed.
              const inside = selectionTarget(configuration, id, { entered: target })
              if (inside && inside !== target) select({ type: 'widget', id: inside })
            }}>
            {clip ? (
              <clipPath id={containerClipId(layerIndex)}>
                <rect {...clip} />
              </clipPath>
            ) : null}
            <g clipPath={clip ? `url(#${containerClipId(layerIndex)})` : undefined}>
            <WidgetBody
              configuration={layer.configuration}
              values={values}
              clipId={widgetClipId(layerIndex)}
              screenBackground={screenBackground}
            />
            </g>
            {(id && locked[id]) || activeTool !== 'select' ? null : (
              <HitArea placement={completePlacement(layer.configuration.placement)} />
            )}
          </g>
        )
      })}
      {/* A widget its container cuts away entirely draws nothing, here and on
          the board. Nothing is not something an author can select or drag back,
          so the editor says where it went — the hit area under this outline is
          live, which is what makes it recoverable. */}
      {layers.map((layer) => {
        const id = layer.configuration.id
        const placement = id ? placements.get(id) : undefined
        if (!id || !placement || !layer.clip || hidden[id]) return null
        const visible = intersection(layer.clip, placement)
        if (visible.width > 0 && visible.height > 0) return null
        return (
          <rect
            key={`clipped-${id}`}
            {...placement}
            fill="none"
            stroke="#F59E0B"
            strokeOpacity={0.7}
            strokeWidth={1 / view.zoom}
            strokeDasharray={`${2 / view.zoom} ${3 / view.zoom}`}
            pointerEvents="none"
          />
        )
      })}
      {/* A tap target is only a tap target on the board, so the canvas says so:
          an empty transparent shape would otherwise be an invisible rectangle. */}
      {tapTargets.map(({ id, placement, label }) => (
        <g key={`action-${id}`} pointerEvents="none">
          <rect
            {...placement}
            fill="none"
            stroke="#38F5A8"
            strokeWidth={1 / view.zoom}
            strokeDasharray={`${5 / view.zoom} ${3 / view.zoom}`}
          />
          <text
            x={placement.x + 2 / view.zoom}
            y={placement.y + 10 / view.zoom}
            fill="#38F5A8"
            fontSize={9 / view.zoom}
          >
            {label}
          </text>
        </g>
      ))}
      {/* Every selected widget is outlined; the handles go on the primary one,
          or on the box around them all when there is more than one. */}
      {selectedPlacements.map((placement, index) => (
        <rect
          key={index}
          {...placement}
          fill="none"
          stroke="#38BDF8"
          strokeWidth={1 / view.zoom}
          strokeDasharray={`${4 / view.zoom} ${3 / view.zoom}`}
          pointerEvents="none"
        />
      ))}
      <TargetOutline boxes={highlightedBoxes} zoom={view.zoom} />
      <GuideOverlay guides={feedback.guides} zoom={view.zoom} />
      <GapOverlay gaps={feedback.gaps} zoom={view.zoom} />
      {groupPlacement ? (
        <SelectionFrame
          placement={groupPlacement}
          zoom={view.zoom}
          group
          onResize={(event, mode) => {
            if (selection) beginInteraction(event, selection, mode, groupPlacement)
          }}
        />
      ) : selection && primaryPlacement ? (
        <SelectionFrame
          placement={primaryPlacement}
          zoom={view.zoom}
          onResize={(event, mode) => beginInteraction(event, selection, mode, primaryPlacement)}
        />
      ) : null}
      {drawing && (drawing.width >= 1 || drawing.height >= 1) ? (
        <rect
          {...drawing}
          fill="#38F5A8"
          fillOpacity={0.1}
          stroke="#38F5A8"
          strokeWidth={1 / view.zoom}
          pointerEvents="none"
        />
      ) : null}
      {feedback.badge ? (
        <MeasureBadge
          placement={feedback.badge.placement}
          mode={feedback.badge.mode}
          display={display}
          zoom={view.zoom}
        />
      ) : null}
      {/* What the click will put down, drawn where it will land. Inert, so the
          press underneath it still reaches the surface. */}
      {fittedInsert && insertAt ? (
        <g
          opacity={0.6}
          pointerEvents="none"
          transform={`translate(${Math.round(insertAt.x - fittedInsert.width / 2) - (completePlacement(fittedInsert.widget.placement)?.x ?? 0)} ${Math.round(insertAt.y - fittedInsert.height / 2) - (completePlacement(fittedInsert.widget.placement)?.y ?? 0)})`}
        >
          {/* Flattened, so a container being placed shows what is inside it
              rather than an empty box. */}
          <WidgetLayers
            layers={flattenScreen({ widgets: [fittedInsert.widget] }, {})}
            background={screenBackground}
          />
          <rect
            {...(completePlacement(fittedInsert.widget.placement) ?? { x: 0, y: 0, width: 0, height: 0 })}
            fill="none"
            stroke="#38BDF8"
            strokeDasharray={`${4 / view.zoom} ${3 / view.zoom}`}
            strokeWidth={1 / view.zoom}
          />
        </g>
      ) : null}
      {band && (band.width >= 2 || band.height >= 2) ? (
        <rect
          {...band}
          fill="#38BDF8"
          fillOpacity={0.12}
          stroke="#38BDF8"
          strokeWidth={1 / view.zoom}
          pointerEvents="none"
        />
      ) : null}
    </svg>
    {menu ? (
      <CanvasContextMenu
        x={menu.x}
        y={menu.y}
        widgetId={menu.widgetId}
        display={display}
        at={menu.at}
        onClose={() => setMenu(undefined)}
      />
    ) : null}
    </>
  )
}

// Smaller than this is a click that missed rather than a box that was drawn.
const MINIMUM_DRAWN_PX = 4

function drawnBox(start: { x: number; y: number }, current: { x: number; y: number }): Placement {
  return {
    x: Math.round(Math.min(start.x, current.x)),
    y: Math.round(Math.min(start.y, current.y)),
    width: Math.round(Math.abs(current.x - start.x)),
    height: Math.round(Math.abs(current.y - start.y))
  }
}

/** The box around every selected widget, which is what a group resize acts on. */
function unionOf(placements: readonly Placement[]): Placement | undefined {
  if (placements.length === 0) return undefined
  const left = Math.min(...placements.map((box) => box.x))
  const top = Math.min(...placements.map((box) => box.y))
  const right = Math.max(...placements.map((box) => box.x + box.width))
  const bottom = Math.max(...placements.map((box) => box.y + box.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}
