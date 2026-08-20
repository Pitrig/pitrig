import React from 'react'

import type { DisplayDescriptor } from '@shared/device'
import type { Placement, ResizeMode } from './canvas-geometry'
import type { GapLabel, SnapGuide } from './snapping'

// The canvas chrome: what is drawn over the widgets rather than by them — the
// grid, the snap guides and their measurements, the pointer target and the
// selection handles. None of it reads the document or holds state, which is why
// it is not tangled with the gesture machine next door.
//
// Everything is sized in screen pixels by dividing by the zoom, so a handle
// stays the same size to grab and a guide stays one hairline wide however far
// the canvas is magnified.

const GUIDE_COLOR = '#F472B6'
const SELECTION_COLOR = '#38BDF8'
const TARGET_COLOR = '#F59E0B'

export function GridOverlay({ display, size, zoom }: { display: DisplayDescriptor; size: number; zoom: number }): React.JSX.Element | null {
  if (size <= 0) return null
  // A grid finer than a couple of screen pixels reads as a wash rather than as
  // a grid, so it is left out until the canvas is magnified enough to show it.
  const step = size * zoom >= 4 ? size : size * Math.ceil(4 / (size * zoom))
  const lines: React.JSX.Element[] = []
  for (let x = step; x < display.width; x += step) {
    lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={display.height} stroke="#94A3B8" strokeOpacity={0.18} strokeWidth={1 / zoom} />)
  }
  for (let y = step; y < display.height; y += step) {
    lines.push(<line key={`y${y}`} x1={0} y1={y} x2={display.width} y2={y} stroke="#94A3B8" strokeOpacity={0.18} strokeWidth={1 / zoom} />)
  }
  return <g pointerEvents="none">{lines}</g>
}

/**
 * The lines a gesture landed on. Each one covers only the two boxes it
 * relates, rather than crossing the whole display: a line from edge to edge
 * says something lined up somewhere, and this says what with.
 */
export function GuideOverlay({ guides, zoom }: { guides: readonly SnapGuide[]; zoom: number }): React.JSX.Element {
  return (
    <g pointerEvents="none">
      {guides.map((guide, index) =>
        guide.axis === 'x' ? (
          <line
            key={index}
            x1={guide.position}
            y1={guide.from}
            x2={guide.position}
            y2={guide.to}
            stroke={GUIDE_COLOR}
            strokeWidth={1 / zoom}
          />
        ) : (
          <line
            key={index}
            x1={guide.from}
            y1={guide.position}
            x2={guide.to}
            y2={guide.position}
            stroke={GUIDE_COLOR}
            strokeWidth={1 / zoom}
          />
        )
      )}
    </g>
  )
}

/**
 * The distance to whatever stands beside the box, with its number. A matched
 * gap — one the box snapped to because the row already had it — is drawn solid;
 * the rest are the measurements the gesture happens to have produced.
 */
export function GapOverlay({ gaps, zoom }: { gaps: readonly GapLabel[]; zoom: number }): React.JSX.Element {
  const tick = 3 / zoom
  return (
    <g pointerEvents="none">
      {gaps.map((gap, index) => {
        const horizontal = gap.axis === 'x'
        const x1 = horizontal ? gap.from : gap.at
        const y1 = horizontal ? gap.at : gap.from
        const x2 = horizontal ? gap.to : gap.at
        const y2 = horizontal ? gap.at : gap.to
        const color = gap.matched ? GUIDE_COLOR : '#94A3B8'
        return (
          <g key={index} opacity={gap.matched ? 1 : 0.75}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1 / zoom} />
            {/* End caps, so a short measurement still reads as a measurement. */}
            <line
              x1={horizontal ? x1 : x1 - tick}
              y1={horizontal ? y1 - tick : y1}
              x2={horizontal ? x1 : x1 + tick}
              y2={horizontal ? y1 + tick : y1}
              stroke={color}
              strokeWidth={1 / zoom}
            />
            <line
              x1={horizontal ? x2 : x2 - tick}
              y1={horizontal ? y2 - tick : y2}
              x2={horizontal ? x2 : x2 + tick}
              y2={horizontal ? y2 + tick : y2}
              stroke={color}
              strokeWidth={1 / zoom}
            />
            <text
              x={horizontal ? (x1 + x2) / 2 : x1 + 4 / zoom}
              y={horizontal ? y1 - 4 / zoom : (y1 + y2) / 2}
              fill={color}
              fontSize={9 / zoom}
              textAnchor={horizontal ? 'middle' : 'start'}
              dominantBaseline={horizontal ? 'auto' : 'middle'}
            >
              {gap.distance}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** The widget a gesture lined up with, outlined while it does. */
export function TargetOutline({ boxes, zoom }: { boxes: readonly Placement[]; zoom: number }): React.JSX.Element {
  return (
    <g pointerEvents="none">
      {boxes.map((box, index) => (
        <rect
          key={index}
          {...box}
          fill="none"
          stroke={TARGET_COLOR}
          strokeOpacity={0.9}
          strokeWidth={1 / zoom}
        />
      ))}
    </g>
  )
}

/**
 * What the box being dragged currently is, beside the pointer. The inspector
 * says the same thing, but reading it means looking away from the thing being
 * placed — which is exactly when the number matters.
 */
export function MeasureBadge({
  placement,
  mode,
  display,
  zoom
}: {
  placement: Placement
  mode: 'move' | 'resize'
  display: DisplayDescriptor
  zoom: number
}): React.JSX.Element {
  const text =
    mode === 'move'
      ? `${placement.x}, ${placement.y}`
      : `${placement.width} × ${placement.height}`
  const width = (text.length * 6 + 10) / zoom
  const height = 16 / zoom
  // Below the box normally, above it when there is no room — the badge belongs
  // to the gesture, so it must not fall off the display and disappear.
  const below = placement.y + placement.height + 6 / zoom
  const y = below + height <= display.height ? below : placement.y - height - 6 / zoom
  const x = Math.min(Math.max(placement.x, 0), Math.max(0, display.width - width))
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={width} height={height} rx={3 / zoom} fill="#0F172A" fillOpacity={0.9} stroke={SELECTION_COLOR} strokeWidth={1 / zoom} />
      <text x={x + 5 / zoom} y={y + height / 2} fill="#E0F2FE" fontSize={10 / zoom} dominantBaseline="middle">
        {text}
      </text>
    </g>
  )
}

export function HitArea({ placement }: { placement?: Placement }): React.JSX.Element | null {
  return placement ? <rect {...placement} fill="transparent" className="cursor-move" /> : null
}

const HANDLE_CURSORS: Record<ResizeMode, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize'
}

/**
 * The box a resize acts on and the eight handles that drive it. One selected
 * widget or a whole selection: a group is resized by the box around it, which
 * is the same gesture over a different rectangle.
 */
export function SelectionFrame({
  placement,
  zoom,
  group,
  onResize
}: {
  placement: Placement
  zoom: number
  group?: boolean
  onResize: (event: React.PointerEvent<SVGElement>, mode: ResizeMode) => void
}): React.JSX.Element {
  const points: Array<[ResizeMode, number, number]> = [
    ['nw', placement.x, placement.y], ['n', placement.x + placement.width / 2, placement.y],
    ['ne', placement.x + placement.width, placement.y], ['e', placement.x + placement.width, placement.y + placement.height / 2],
    ['se', placement.x + placement.width, placement.y + placement.height], ['s', placement.x + placement.width / 2, placement.y + placement.height],
    ['sw', placement.x, placement.y + placement.height], ['w', placement.x, placement.y + placement.height / 2]
  ]
  return <g aria-label={group ? 'Selected widgets bounds' : 'Selected widget bounds'}>
    <rect {...placement} fill="none" stroke={SELECTION_COLOR} strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom} ${3 / zoom}`} pointerEvents="none" />
    {points.map(([mode, cx, cy]) => (
      <rect
        key={mode}
        x={cx - 4 / zoom}
        y={cy - 4 / zoom}
        width={8 / zoom}
        height={8 / zoom}
        fill={group ? '#0F172A' : '#0EA5E9'}
        stroke="#E0F2FE"
        strokeWidth={1.5 / zoom}
        style={{ cursor: HANDLE_CURSORS[mode] }}
        onPointerDown={(event) => onResize(event, mode)}
      />
    ))}
  </g>
}
