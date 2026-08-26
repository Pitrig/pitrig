import { useMemo } from 'react'

import type { WidgetConfiguration } from '@shared/configuration-schema'

import { completePlacement } from '@/features/configuration/dashboard-editor'
import { flattenScreen } from '@/features/configuration/preview/preview-layers'
import { SCREEN_BACKGROUND } from '@/features/configuration/preview/preview-theme'
import { WidgetLayers } from '@/features/configuration/preview/WidgetLayers'

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
      <WidgetLayers layers={layers} background={SCREEN_BACKGROUND} />
    </svg>
  )
}
