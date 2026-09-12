import { memo } from 'react'

import type { WidgetConfiguration } from '@shared/configuration-schema'

import { completePlacement } from '../dashboard-editor'
import { ArcPreview, BarPreview, GraphPreview } from './gauge-previews'
import { IndicatorPreview } from './indicator-preview'
import { ImagePreview } from './ImagePreview'
import { cornerRadii, squareFill } from './preview-geometry-paint'
import { type PreviewValues, authoredStyleOf } from './preview-values'
import { TextWidgetPreview } from './TextPreview'
import { CaptionPreview, ShapePreview } from './widget-previews'

export const WidgetBody = memo(function WidgetBody({
  configuration,
  values,
  clipId,
  behind
}: {
  configuration: WidgetConfiguration
  values: PreviewValues
  clipId: string
  behind: string
}): React.JSX.Element | null {
  const box = completePlacement(configuration.placement)
  const clipCorner = squareFill(configuration) ? (configuration.border?.radius_px ?? 0) : 0
  const style = values.styleFor(configuration, authoredStyleOf(configuration))
  if (!style.visible) return null
  const captioned = configuration.type !== 'slot'
  return (
    <>
      {box ? (
        <clipPath id={clipId}>
          <rect {...box} {...cornerRadii(clipCorner, box.width, box.height)} />
        </clipPath>
      ) : null}
      <g clipPath={box ? `url(#${clipId})` : undefined}>
        {configuration.type === 'bar' ? (
          <BarPreview configuration={configuration} values={values} style={style} />
        ) : configuration.type === 'arc' ? (
          <ArcPreview configuration={configuration} values={values} style={style} />
        ) : configuration.type === 'indicator' ? (
          <IndicatorPreview configuration={configuration} values={values} style={style} />
        ) : configuration.type === 'graph' ? (
          <GraphPreview configuration={configuration} style={style} />
        ) : configuration.type === 'image' ? (
          <ImagePreview configuration={configuration} values={values} style={style} />
        ) : configuration.type === 'shape' ? (
          <ShapePreview configuration={configuration} style={style} />
        ) : configuration.type === 'slot' ? null : (
          <TextWidgetPreview configuration={configuration} values={values} style={style} />
        )}
      </g>
      {captioned ? (
        <CaptionPreview
          configuration={configuration}
          values={values}
          style={style}
          behind={behind}
        />
      ) : null}
    </>
  )
})
