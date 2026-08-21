import { useId, useMemo } from 'react'

import type { PreviewLayer } from './canvas-geometry'
import { createPreviewValues } from './preview-values'
import { WidgetBody } from './WidgetBody'

/**
 * A flattened tree, drawn back to front.
 *
 * Every surface that shows a widget goes through this, because a container is
 * not one widget: it is a box and everything inside it, at its own offsets and
 * under its own clip. Drawing only the widget handed in produced exactly what
 * you would expect — an empty rounded rectangle where a rev-counter cluster
 * should have been.
 */
export function WidgetLayers({
  layers,
  background
}: {
  layers: readonly PreviewLayer[]
  background: string
}): React.JSX.Element {
  const prefix = useId()
  const values = useMemo(() => createPreviewValues(), [])
  return (
    <>
      {layers.map((layer, layerIndex) => {
        // The clip arrives in display coordinates and this group is already
        // translated by the container chain, so it is read back into local
        // space rather than the transform being undone around it.
        const clip = layer.clip
          ? { ...layer.clip, x: layer.clip.x - layer.offsetX, y: layer.clip.y - layer.offsetY }
          : undefined
        return (
          <g
            key={layer.configuration.id ?? layerIndex}
            transform={
              layer.offsetX || layer.offsetY
                ? `translate(${layer.offsetX} ${layer.offsetY})`
                : undefined
            }
          >
            {clip ? (
              <clipPath id={`${prefix}-container-${layerIndex}`}>
                <rect {...clip} />
              </clipPath>
            ) : null}
            <g clipPath={clip ? `url(#${prefix}-container-${layerIndex})` : undefined}>
              <WidgetBody
                configuration={layer.configuration}
                values={values}
                clipId={`${prefix}-widget-${layerIndex}`}
                screenBackground={background}
              />
            </g>
          </g>
        )
      })}
    </>
  )
}
