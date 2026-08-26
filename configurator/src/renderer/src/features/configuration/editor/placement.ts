interface Bounds {
  width: number
  height: number
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

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
