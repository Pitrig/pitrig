import type { PreviewImageAsset } from '../../shared/preview-assets'
import type { DashboardFileContent } from '../dashboard-files/dashboard-file-format'
import { encodePlanesAsPng } from '../image-assets/image-pixels'

export function previewsOf(content: Pick<DashboardFileContent, 'images'>): PreviewImageAsset[] {
  const previews: PreviewImageAsset[] = []
  for (const image of content.images) {
    const png = encodePlanesAsPng({
      format: image.format,
      width: image.width,
      height: image.height,
      frameCount: image.frameCount,
      bytes: image.planes
    })
    if (!png) continue
    previews.push({
      name: image.id,
      width: image.width,
      height: image.height,
      frameCount: image.frameCount,
      format: image.format,
      dataUrl: `data:image/png;base64,${png.toString('base64')}`
    })
  }
  return previews
}
