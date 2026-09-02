import { type LayoutTransferNote, type LayoutTransferResult } from '@shared/layout-transfer'
import { formatList, t } from '@shared/ui-text'

const NAMES_SHOWN = 4

export function transferReportLines(result: LayoutTransferResult): string[] {
  const { from, to, fit, scale, notes } = result
  const lines: string[] = []
  const sizes = t('dashboard.transfer.sizes', {
    fromWidth: from.width,
    fromHeight: from.height,
    toWidth: to.width,
    toHeight: to.height
  })
  if (to.width === 0 || to.height === 0) {
    lines.push(t('dashboard.transfer.noDisplay'))
  } else if (from.width === to.width && from.height === to.height) {
    lines.push(t('dashboard.transfer.sameSize', { width: to.width, height: to.height }))
  } else if (fit === 'stretch') {
    lines.push(t('dashboard.transfer.stretched', { x: trim(scale.x), y: trim(scale.y), sizes }))
  } else {
    lines.push(t('dashboard.transfer.scaled', { scale: trim(scale.min), sizes }))
  }

  const images = notes.filter((note) => note.kind === 'image_resize_required')
  if (images.length > 0) {
    lines.push(
      t('dashboard.transfer.imagesResized', {
        count: images.length,
        list: list(
          images.map((note) =>
            t('dashboard.transfer.imageEntry', {
              image: note.imageId ?? t('dashboard.transfer.unnamedImage'),
              width: note.size?.width ?? 0,
              height: note.size?.height ?? 0
            })
          )
        )
      })
    )
  }

  const clamped = notes.filter((note) => note.kind === 'field_clamped')
  if (clamped.length > 0) {
    lines.push(
      t('dashboard.transfer.propertiesClamped', {
        count: clamped.length,
        list: list(
          clamped.map((note) =>
            t('dashboard.transfer.clampedEntry', {
              field: note.field ?? '',
              label: label(note),
              from: note.from ?? '',
              to: note.to ?? ''
            })
          )
        )
      })
    )
  }

  const arcs = notes.filter((note) => note.kind === 'arc_thickness_reduced')
  if (arcs.length > 0) {
    lines.push(
      t('dashboard.transfer.arcsThinned', {
        count: arcs.length,
        list: list(
          arcs.map((note) =>
            t('dashboard.transfer.arcEntry', {
              label: label(note),
              from: note.from ?? '',
              to: note.to ?? ''
            })
          )
        )
      })
    )
  }

  if (notes.some((note) => note.kind === 'dashboard_dropped')) {
    lines.push(t('dashboard.transfer.dashboardDropped'))
  }

  const moved = notes.filter((note) => note.kind === 'led_pin_moved')
  if (moved.length > 0) {
    lines.push(
      t('dashboard.transfer.pinsMoved', {
        count: moved.length,
        list: list(
          moved.map((note) =>
            t('dashboard.transfer.movedEntry', {
              output: note.widgetId ?? '',
              from: note.from ?? '',
              to: note.to ?? ''
            })
          )
        )
      })
    )
  }

  const cleared = notes.filter((note) => note.kind === 'led_pin_cleared')
  if (cleared.length > 0) {
    lines.push(
      t('dashboard.transfer.pinsCleared', {
        count: cleared.length,
        list: list(
          cleared.map((note) =>
            t('dashboard.transfer.clearedEntry', {
              output: note.widgetId ?? '',
              from: note.from ?? ''
            })
          )
        )
      })
    )
  }

  const off = notes.filter((note) => note.kind === 'widget_off_display')
  if (off.length > 0) {
    lines.push(
      t('dashboard.transfer.widgetsOffDisplay', {
        count: off.length,
        width: to.width,
        height: to.height,
        list: list(off.map(label))
      })
    )
  }
  return lines
}

function label(note: LayoutTransferNote): string {
  return t('dashboard.transfer.widgetLabel', {
    name: note.widgetId ?? note.widgetType ?? t('dashboard.transfer.unnamedWidget'),
    number: note.screenIndex + 1
  })
}

function list(entries: readonly string[]): string {
  return formatList(entries, NAMES_SHOWN)
}

function trim(scale: number): string {
  return String(Number(scale.toFixed(2)))
}
