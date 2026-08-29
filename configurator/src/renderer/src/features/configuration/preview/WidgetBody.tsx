import type { WidgetConfiguration } from '@shared/configuration-schema'

import { completePlacement } from '../dashboard-editor'
import { ArcPreview, BarPreview, GraphPreview } from './gauge-previews'
import { IndicatorPreview } from './indicator-preview'
import { ImagePreview } from './ImagePreview'
import { squareFill } from './preview-geometry-paint'
import type { PreviewValues } from './preview-values'
import { TextWidgetPreview } from './TextPreview'
import { CaptionPreview, ShapePreview } from './widget-previews'

export function WidgetBody({
  configuration,
  values,
  clipId,
  behind
}: {
  configuration: WidgetConfiguration
  values: PreviewValues
  clipId: string
  behind: string
}): React.JSX.Element {
  const box = completePlacement(configuration.placement)
  const clipCorner = squareFill(configuration) ? (configuration.border?.radius_px ?? 0) : 0
  const captioned =
    configuration.type !== 'slot' && values.styleFor(configuration, {}).visible
  return (
    <>
      {box ? (
        <clipPath id={clipId}>
          <rect {...box} rx={clipCorner} />
        </clipPath>
      ) : null}
      <g clipPath={box ? `url(#${clipId})` : undefined}>
        {configuration.type === 'bar' ? (
          <BarPreview configuration={configuration} values={values} />
        ) : configuration.type === 'arc' ? (
          <ArcPreview configuration={configuration} values={values} />
        ) : configuration.type === 'indicator' ? (
          <IndicatorPreview configuration={configuration} values={values} />
        ) : configuration.type === 'graph' ? (
          <GraphPreview configuration={configuration} values={values} />
        ) : configuration.type === 'image' ? (
          <ImagePreview configuration={configuration} values={values} />
        ) : configuration.type === 'shape' ? (
          <ShapePreview configuration={configuration} values={values} />
        ) : configuration.type === 'slot' ? null : (
          <TextWidgetPreview configuration={configuration} values={values} />
        )}
      </g>
      {captioned ? <CaptionPreview configuration={configuration} behind={behind} /> : null}
    </>
  )
}
