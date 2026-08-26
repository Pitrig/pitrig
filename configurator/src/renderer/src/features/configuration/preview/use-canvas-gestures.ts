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

export function useCanvasGestures(
  context: CanvasContext,
  spaceHeld: boolean,
  placePendingInsert: (event: React.PointerEvent<SVGSVGElement>) => boolean,
  updateGhost: (event: React.PointerEvent<SVGSVGElement>) => void
): GestureHandlers {
  const [interaction, setInteraction] = useState<Interaction>()
  const [draw, setDraw] = useState<Draw>()
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
    const group =
      target.type === 'widget' && selectedIds.includes(target.id)
        ? selectedIds
        : (context.select(target), target.type === 'widget' ? [target.id] : [])
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    if (!point) return
    svgRef.current?.setPointerCapture(event.pointerId)
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
    flushPendingCommit()
    settleDropAfterMove(context, interaction, event)
    useDeviceStore.getState().endEdit()
    setInteraction(undefined)
    setDropContainer(undefined)
    setFeedback(NO_FEEDBACK)
  }

  const beginBackground = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (event.button === 2) return
    if (placePendingInsert(event)) return
    const point = logicalPoint(svgRef.current, event.clientX, event.clientY)
    if (!point) return
    svgRef.current?.setPointerCapture(event.pointerId)
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
