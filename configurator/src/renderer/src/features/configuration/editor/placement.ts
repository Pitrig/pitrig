// Only the dimensions matter here, so anything that carries them will do —
// a board profile, a descriptor, or the pair the keyboard path derives.
interface Bounds {
  width: number
  height: number
}

/**
 * Keeps a value inside a range, and keeps its lower bound when the range is
 * inverted. A widget larger than the display gives `maximum < minimum`, and
 * pinning it to the edge is the only sensible answer there — letting the
 * maximum win would place it at a negative coordinate instead.
 *
 * The canvas and the keyboard used to disagree about exactly this: dragging an
 * oversized widget sent it off the left edge while nudging it did not.
 */
export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

/**
 * The rule for keeping a box on the display, in absolute coordinates. Written
 * once because the drag path, the follower path and the keyboard path all need
 * it and all had their own copy.
 */
export function clampToDisplay(
  x: number,
  y: number,
  width: number,
  height: number,
  display: Bounds
): { x: number; y: number } {
  return {
    x: Math.round(clamp(x, 0, display.width - width)),
    y: Math.round(clamp(y, 0, display.height - height))
  }
}
