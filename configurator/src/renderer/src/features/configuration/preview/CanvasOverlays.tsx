import React from 'react'

import type { DisplayDescriptor } from '@shared/device'
import type { Guides, Placement, ResizeMode } from './canvas-geometry'

// The canvas chrome: what is drawn over the widgets rather than by them — the
// grid, the snap guides, the pointer target and the selection handles. None of
// it reads the document or holds state, which is why it is not tangled with the
// gesture machine next door.

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

export function GuideOverlay({ guides, display, zoom }: { guides: Guides; display: DisplayDescriptor; zoom: number }): React.JSX.Element {
  return (
    <g pointerEvents="none">
      {guides.x.map((x) => (
        <line key={`gx${x}`} x1={x} y1={0} x2={x} y2={display.height} stroke="#F472B6" strokeWidth={1 / zoom} />
      ))}
      {guides.y.map((y) => (
        <line key={`gy${y}`} x1={0} y1={y} x2={display.width} y2={y} stroke="#F472B6" strokeWidth={1 / zoom} />
      ))}
    </g>
  )
}


export function HitArea({ placement }: { placement?: Placement }): React.JSX.Element | null {
  return placement ? <rect {...placement} fill="transparent" className="cursor-move" /> : null
}

export function SelectionFrame({ placement, zoom, onResize }: { placement: Placement; zoom: number; onResize: (event: React.PointerEvent<SVGCircleElement>, mode: ResizeMode) => void }): React.JSX.Element {
  const points: Array<[ResizeMode, number, number]> = [
    ['nw', placement.x, placement.y], ['n', placement.x + placement.width / 2, placement.y],
    ['ne', placement.x + placement.width, placement.y], ['e', placement.x + placement.width, placement.y + placement.height / 2],
    ['se', placement.x + placement.width, placement.y + placement.height], ['s', placement.x + placement.width / 2, placement.y + placement.height],
    ['sw', placement.x, placement.y + placement.height], ['w', placement.x, placement.y + placement.height / 2]
  ]
  return <g aria-label="Selected widget bounds">
    <rect {...placement} fill="none" stroke="#38BDF8" strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom} ${3 / zoom}`} pointerEvents="none" />
    {points.map(([mode, cx, cy]) => <circle key={mode} cx={cx} cy={cy} r={5 / zoom} fill="#0EA5E9" stroke="#E0F2FE" strokeWidth={1.5 / zoom} className="cursor-pointer" onPointerDown={(event) => onResize(event, mode)} />)}
  </g>
}
