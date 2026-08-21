import { useEffect, useRef, useState } from 'react'
import { type WidgetSelection, parentContainerId } from '../dashboard-editor'
import {
  type Draw,
  type Interaction,
  type InteractionMode,
  type Marquee,
  type Pan,
  type Placement,
  clampPan,
  intersects,
  logicalPoint,
  marqueeBounds,
  viewportScale
} from './canvas-geometry'
import { useDashboardEditorStore } from '../dashboard-editor'
import { snapPoint } from './snapping'
import { type CanvasContext, type Feedback, NO_FEEDBACK, drawnBox } from './canvas-gesture-context'
import { commitMove, commitResize, drawLevel, finishDraw, settleDropAfterMove } from './gesture-commits'
import { preferences, resizeSubjects, snapField } from './gesture-fields'
import { useDeviceStore } from '@/features/device/device-store'

interface GestureHandlers {
  interaction: Interaction | undefined
  draw: Draw | undefined
  marquee: Marquee | undefined
  feedback: Feedback
  dropContainer: string | undefined
  beginInteraction: (
    event: React.PointerEvent<SVGElement>,
    target: WidgetSelection,
    mode: InteractionMode,
    placement: Placement
  ) => void
  movePointer: (event: React.PointerEvent<SVGSVGElement>) => void
  finishPointer: (event: React.PointerEvent<SVGSVGElement>) => void
  beginBackground: (event: React.PointerEvent<SVGSVGElement>) => void
}

/**
 * The pointer state machine of the canvas: move, resize, draw, marquee and pan
 * as one set of handlers over the render's CanvasContext. Everything pure —
 * which field a box snaps in, where it would land — lives in gesture-fields.ts;
 * this hook owns only what changes as the pointer moves.
 */
export function useCanvasGestures(
  context: CanvasContext,
  spaceHeld: boolean,
  placePendingInsert: (event: React.PointerEvent<SVGSVGElement>) => boolean,
  updateGhost: (event: React.PointerEvent<SVGSVGElement>) => void
): GestureHandlers {
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
  const { svgRef, display, layers, placements, selectedIds } = context

  const beginInteraction = (
    event: React.PointerEvent<SVGElement>,
    target: WidgetSelection,
    mode: InteractionMode,
    placement: Placement
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    if (target.type === 'widget' && event.shiftKey && mode === 'move') {
      context.extendSelection(target.id)
      return
    }
    // Dragging one of several selected widgets moves the group; dragging an
    // unselected one starts a new selection, which is what a click on it means.
    const group =
      target.type === 'widget' && selectedIds.includes(target.id)
        ? selectedIds
        : (context.select(target), target.type === 'widget' ? [target.id] : [])
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
      level: parentContainerId(context.configuration, target),
      followers:
        mode === 'move'
          ? group
              .filter((id) => id !== primaryId)
              .map((id) => ({ id, placement: placements.get(id) }))
              .filter((entry): entry is { id: string; placement: Placement } =>
                entry.placement !== undefined
              )
          : [],
      subjects:
        mode === 'move'
          ? []
          : resizeSubjects(context, group.length > 1 ? group : [primaryId])
    })
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
  useEffect(
    () => () => {
      if (pendingFrame.current !== undefined) cancelAnimationFrame(pendingFrame.current)
      pendingCommit.current = undefined
    },
    []
  )

  const movePointer = (event: React.PointerEvent<SVGSVGElement>): void => {
    updateGhost(event)
    if (pan && event.pointerId === pan.pointerId) {
      const scale = viewportScale(svgRef.current, display, context.view.zoom)
      useDashboardEditorStore.getState().setView(
        clampPan(
          {
            panX: pan.startPanX - (event.clientX - pan.startClientX) / scale,
            panY: pan.startPanY - (event.clientY - pan.startClientY) / scale
          },
          display,
          context.view.zoom
        )
      )
      return
    }
    if (draw && event.pointerId === draw.pointerId) {
      const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
      if (!point) return
      const corner = snapPoint(
        point,
        snapField(context, drawLevel(context, draw), new Set()),
        display,
        preferences(context, event)
      )
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
      if (interaction.mode === 'move')
        commitMove(context, interaction, dx, dy, modifiers, setFeedback, setDropContainer)
      else commitResize(context, interaction, dx, dy, modifiers, setFeedback)
    }
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = undefined
      const commit = pendingCommit.current
      pendingCommit.current = undefined
      commit?.()
    })
  }

  const finishPointer = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (pan?.pointerId === event.pointerId) {
      svgRef.current?.releasePointerCapture(event.pointerId)
      setPan(undefined)
      return
    }
    if (draw?.pointerId === event.pointerId) {
      svgRef.current?.releasePointerCapture(event.pointerId)
      finishDraw(context, draw)
      setDraw(undefined)
      setFeedback(NO_FEEDBACK)
      return
    }
    if (marquee?.pointerId === event.pointerId) {
      svgRef.current?.releasePointerCapture(event.pointerId)
      const bounds = marqueeBounds(marquee)
      // A click rather than a drag: the screen is what was picked.
      if (bounds.width < 2 && bounds.height < 2) {
        if (!marquee.additive) context.select({ type: 'screen' })
      } else {
        const caught = layers
          .map((layer) => layer.configuration)
          .filter((widget) => widget.id && !context.hidden[widget.id] && !context.locked[widget.id])
          .filter((widget) => {
            const placement = placements.get(widget.id as string)
            return placement !== undefined && intersects(placement, bounds)
          })
          .map((widget) => widget.id as string)
        context.selectMany(marquee.additive ? [...new Set([...selectedIds, ...caught])] : caught)
      }
      setMarquee(undefined)
      return
    }
    if (interaction?.pointerId !== event.pointerId) return
    svgRef.current?.releasePointerCapture(event.pointerId)
    // The last move may still be waiting for a frame; it has to land, and it
    // has to land inside the history group this gesture opened.
    flushPendingCommit()
    settleDropAfterMove(context, interaction, event)
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
        startPanX: context.view.panX,
        startPanY: context.view.panY
      })
      return
    }
    if (context.activeTool !== 'select') {
      const corner = snapPoint(
        point,
        snapField(context, context.drillIn, new Set()),
        display,
        preferences(context, event)
      )
      setDraw({
        pointerId: event.pointerId,
        tool: context.activeTool,
        start: corner,
        current: corner
      })
      return
    }
    setMarquee({
      pointerId: event.pointerId,
      start: point,
      current: point,
      additive: event.shiftKey
    })
  }

  return {
    interaction,
    draw,
    marquee,
    feedback,
    dropContainer,
    beginInteraction,
    movePointer,
    finishPointer,
    beginBackground
  }
}
