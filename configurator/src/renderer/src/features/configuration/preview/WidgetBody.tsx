import type { WidgetConfiguration } from '@shared/configuration-schema'

import { completePlacement } from '../dashboard-editor'
import { ArcPreview, BarPreview, GraphPreview, IndicatorPreview } from './gauge-previews'
import { ImagePreview } from './ImagePreview'
import type { PreviewValues } from './preview-values'
import { TextWidgetPreview } from './TextPreview'
import { CaptionPreview, ShapePreview } from './widget-previews'

export function WidgetBody({
  configuration,
  values,
  clipId,
  screenBackground
}: {
  configuration: WidgetConfiguration
  values: PreviewValues
  clipId: string
  screenBackground: string
}): React.JSX.Element {
  const box = completePlacement(configuration.placement)
  return (
    <>
      {box ? (
        <clipPath id={clipId}>
          <rect {...box} />
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
      {configuration.type === 'slot' ? null : (
        <CaptionPreview configuration={configuration} behind={screenBackground} />
      )}
    </>
  )
}
