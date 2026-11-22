import { useEffect, useMemo } from 'react'

import type { WidgetConfiguration } from '@shared/configuration-schema'

import { completePlacement } from '@/features/configuration/dashboard-editor'
import { PreviewImageOverrides } from '@/features/configuration/preview/preview-assets'
import { flattenScreen } from '@/features/configuration/preview/preview-layers'
import { WidgetLayers } from '@/features/configuration/preview/WidgetLayers'
import { useTemplatesStore } from './templates-store'

export function WidgetTemplateThumbnail({
  id,
  widget,
  className
}: {
  id: string
  widget: WidgetConfiguration
  className?: string
}): React.JSX.Element {
  const images = useTemplatesStore((state) => state.widgetImages[id])
  const loadWidgetImages = useTemplatesStore((state) => state.loadWidgetImages)
  useEffect(() => {
    if (images === undefined) loadWidgetImages(id)
  }, [images, id, loadWidgetImages])
  return (
    <PreviewImageOverrides.Provider value={typeof images === 'object' ? images : undefined}>
      <WidgetThumbnail widget={widget} className={className} />
    </PreviewImageOverrides.Provider>
  )
}

export function WidgetThumbnail({
  widget,
  className
}: {
  widget: WidgetConfiguration
  className?: string
}): React.JSX.Element {
  const layers = useMemo(() => flattenScreen({ widgets: [widget] }, {}), [widget])
  const box = completePlacement(widget.placement)
  if (!box || box.width <= 0 || box.height <= 0) {
    return <div className={className} />
  }
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <WidgetLayers layers={layers} />
    </svg>
  )
}
