import { type LayoutTransferNote, type LayoutTransferResult } from '@shared/layout-transfer'

const NAMES_SHOWN = 4

export function transferReportLines(result: LayoutTransferResult): string[] {
  const { from, to, fit, scale, notes } = result
  const lines: string[] = []
  const sizes = `${from.width} × ${from.height} → ${to.width} × ${to.height}`
  if (from.width === to.width && from.height === to.height) {
    lines.push(`The board changed; its display is ${to.width} × ${to.height} either way, so nothing moved.`)
  } else if (fit === 'stretch') {
    lines.push(
      `Stretched by ${trim(scale.x)} across and ${trim(scale.y)} down to fill the display; ${sizes}.`
    )
  } else {
    lines.push(`Scaled by ${trim(scale.min)} and centred; ${sizes}.`)
  }

  const images = notes.filter((note) => note.kind === 'image_resize_required')
  if (images.length > 0) {
    lines.push(
      `${count(images.length, 'image')} now ${images.length === 1 ? 'draws' : 'draw'} at a new size and must be uploaded again: ${list(
        images.map((note) => `${note.imageId ?? 'image'} at ${note.size?.width} × ${note.size?.height}`)
      )}.`
    )
  }

  const clamped = notes.filter((note) => note.kind === 'field_clamped')
  if (clamped.length > 0) {
    lines.push(
      `${count(clamped.length, 'property')} did not fit the range the device accepts and ${clamped.length === 1 ? 'was' : 'were'} limited: ${list(
        clamped.map((note) => `${note.field} on ${label(note)} (${note.from} → ${note.to})`)
      )}.`
    )
  }

  const arcs = notes.filter((note) => note.kind === 'arc_thickness_reduced')
  if (arcs.length > 0) {
    lines.push(
      `${count(arcs.length, 'arc')} had its ring thinned so two thicknesses still fit across it: ${list(
        arcs.map((note) => `${label(note)} (${note.from} → ${note.to} px)`)
      )}.`
    )
  }

  const off = notes.filter((note) => note.kind === 'widget_off_display')
  if (off.length > 0) {
    lines.push(
      `${count(off.length, 'widget')} would sit entirely off the ${to.width} × ${to.height} display and the board will reject the document: ${list(
        off.map(label)
      )}.`
    )
  }
  return lines
}

function label(note: LayoutTransferNote): string {
  const name = note.widgetId ?? note.widgetType ?? 'widget'
  return `"${name}" on screen ${note.screenIndex + 1}`
}

function count(total: number, noun: string): string {
  const plural = noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`
  return `${total} ${total === 1 ? noun : plural}`
}

function list(entries: readonly string[]): string {
  const shown = entries.slice(0, NAMES_SHOWN)
  const rest = entries.length - shown.length
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(', ')
}

function trim(scale: number): string {
  return String(Number(scale.toFixed(2)))
}
