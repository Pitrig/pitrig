import { useId, useMemo } from 'react'

import type { PreviewLayer } from './canvas-geometry'
import { createPreviewValues } from './preview-values'
import { WidgetBody } from './WidgetBody'

export function WidgetLayers({
  layers
}: {
  layers: readonly PreviewLayer[]
}): React.JSX.Element {
  const prefix = useId()
  const values = useMemo(() => createPreviewValues(), [])
  return (
    <>
      {layers.map((layer, layerIndex) => {
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
                behind={layer.behind}
              />
            </g>
          </g>
        )
      })}
    </>
  )
}
