import { useMemo } from 'react'

import type { WidgetConfiguration } from '@shared/configuration-schema'

import { completePlacement } from '@/features/configuration/dashboard-editor'
import { flattenScreen } from '@/features/configuration/preview/preview-layers'
import { SCREEN_BACKGROUND } from '@/features/configuration/preview/preview-theme'
import { WidgetLayers } from '@/features/configuration/preview/WidgetLayers'

/**
 * A library entry drawn as itself, fitted into whatever box it is given.
 *
 * A row could have shown a type icon instead, and that is what it did until an
 * entry turned out to be a container: "shape" is a true and useless thing to
 * say about a saved rev-counter cluster. Drawing the fragment costs one more
 * SVG per row and answers the only question the row is asked.
 *
 * The entry is flattened before it is drawn, exactly as a screen is. Drawing
 * the widget on its own was the obvious thing and the wrong one — a container
 * is a box *and everything inside it*, so a cluster came out as an empty
 * rounded rectangle.
 *
 * The viewBox is the widget's own box, so nothing here has to scale anything —
 * the browser fits it, and `xMidYMid meet` keeps its proportions.
 */
export function WidgetThumbnail({
  widget,
  className
}: {
  widget: WidgetConfiguration
  className?: string
}): React.JSX.Element {
  // One synthetic screen holding the fragment: `flattenScreen` is what knows how
  // a container's children are offset and clipped, and it takes a screen.
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
