import type { ImageColorFormat } from '@shared/image-assets'

/** What the format picker calls each pixel format the device accepts. */
export const FORMAT_LABELS: Record<ImageColorFormat, string> = {
  rgb565a8: 'Colour + transparency',
  rgb565: 'Colour, no transparency',
  alpha8: 'Mask (alpha only)'
}
