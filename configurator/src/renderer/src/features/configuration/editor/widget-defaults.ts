import {
  type FontSpec,
  type WidgetConfiguration,
  type WidgetPlacement
} from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { documentFonts } from '@shared/document-fonts'
import { DEFAULT_FONT_FAMILY } from '@shared/font-assets'

export const DEFAULT_WIDGET_FONT_SIZE_PX = 24
export const DEFAULT_CAPTION_FONT_SIZE_PX = 16

function commonest<T>(values: readonly T[]): T | undefined {
  const tally = new Map<T, number>()
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1)
  let best: T | undefined
  let bestCount = 0
  for (const [value, count] of tally) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

function draftFonts(configuration: DeviceConfiguration | undefined): FontSpec[] {
  return documentFonts(configuration).filter((font): font is FontSpec => font !== undefined)
}

export function draftFontFamily(
  configuration: DeviceConfiguration | undefined,
  preferredFamily?: string
): string {
  const families = draftFonts(configuration)
    .map((font) => font.family)
    .filter((family): family is string => Boolean(family))
  return preferredFamily ?? commonest(families) ?? DEFAULT_FONT_FAMILY
}

export function draftValueFont(
  configuration: DeviceConfiguration | undefined,
  preferredFamily?: string
): FontSpec {
  const family = draftFontFamily(configuration, preferredFamily)
  const sizes = draftFonts(configuration)
    .filter((font) => font.family === family)
    .map((font) => font.size_px)
    .filter((size): size is number => typeof size === 'number' && size > 0)
  return { family, size_px: commonest(sizes) ?? DEFAULT_WIDGET_FONT_SIZE_PX }
}

export const NEW_GRAPH_BINDING = 'vehicle.speed'

export const NEW_WIDGET_SIZE: Record<
  WidgetConfiguration['type'],
  { width: number; height: number }
> = {
  text: { width: 120, height: 64 },
  shape: { width: 160, height: 80 },
  slot: { width: 200, height: 100 },
  bar: { width: 200, height: 24 },
  arc: { width: 120, height: 120 },
  indicator: { width: 240, height: 20 },
  image: { width: 96, height: 96 },
  graph: { width: 200, height: 80 }
}

export interface NewWidgetExtras {
  font?: FontSpec
  image?: string
  placement?: Required<WidgetPlacement>
  into?: string | 'screen'
}

export const WIDGET_DEFAULTS: Record<
  WidgetConfiguration['type'],
  (
    display: { width: number; height: number },
    extras: NewWidgetExtras
  ) => WidgetConfiguration
> = {
  text: (display, { font }) => ({
    type: 'text',
    sources: [{}],
    ...(font ? { value: { font } } : {}),
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.text)
  }),
  shape: (display) => ({
    type: 'shape',
    background_color: '#1E293B',
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.shape)
  }),
  slot: (display) => ({
    type: 'slot',
    pages: [{}, {}],
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.slot)
  }),
  bar: (display) => ({
    type: 'bar',
    background_color: '#1E293B',
    source: { binding: 'vehicle.throttle' },
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.bar)
  }),
  arc: (display) => ({
    type: 'arc',
    source: { binding: 'engine.rpm_percent' },
    track_color: '#1E293B',
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.arc)
  }),
  indicator: (display) => ({
    type: 'indicator',
    source: { binding: 'engine.rpm_percent' },
    off_color: '#1E293B',
    segments: [
      { threshold: 0.5, color: '#00C853' },
      { threshold: 0.62, color: '#00C853' },
      { threshold: 0.74, color: '#FFD200' },
      { threshold: 0.84, color: '#FFD200' },
      { threshold: 0.92, color: '#D50000' },
      { threshold: 0.97, color: '#D50000' }
    ],
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.indicator)
  }),
  image: (display, { image }) => ({
    type: 'image',
    ...(image ? { image } : {}),
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.image)
  }),
  graph: (display) => ({
    type: 'graph',
    source: { binding: NEW_GRAPH_BINDING },
    background_color: '#1E293B',
    placement: centeredPlacement(display, NEW_WIDGET_SIZE.graph)
  }),
}


export function centeredPlacement(
  display: { width: number; height: number },
  preferred: { width: number; height: number }
): WidgetPlacement {
  const width = Math.min(preferred.width, display.width)
  const height = Math.min(preferred.height, display.height)
  return {
    x: Math.floor((display.width - width) / 2),
    y: Math.floor((display.height - height) / 2),
    width,
    height
  }
}
