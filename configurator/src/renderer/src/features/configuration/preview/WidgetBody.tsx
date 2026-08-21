import type { WidgetConfiguration } from '@shared/configuration-schema'

import { completePlacement } from '../dashboard-editor'
import { ArcPreview, BarPreview, GraphPreview, IndicatorPreview } from './gauge-previews'
import { ImagePreview } from './ImagePreview'
import type { PreviewValues } from './preview-values'
import { TextWidgetPreview } from './TextPreview'
import { CaptionPreview, ShapePreview } from './widget-previews'

/**
 * What one widget draws, and nothing else.
 *
 * Two clips are the device's, and only the inner one belongs here: the widget's
 * own box clips its contents, exactly as its LVGL container does — a value
 * wider than its widget is cut off on the board rather than spilling over its
 * neighbours — and its caption is left out of that, because the device puts the
 * caption on the parent where it overhangs the frame. The container chain above
 * it is the caller's business, since only the caller knows what that chain is.
 *
 * It is a component rather than a switch inside the canvas because three
 * surfaces draw the same widget now: the canvas, the ghost that follows the
 * pointer while a library entry is being placed, and the library row itself. A
 * type added to the contract has to appear in all three or in none.
 */
export function WidgetBody({
  configuration,
  values,
  clipId,
  screenBackground
}: {
  configuration: WidgetConfiguration
  values: PreviewValues
  /** Unique within the document this is drawn into; SVG clip ids are global. */
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
      {/* A slot draws nothing of its own — it is an area that switches what it
          shows — so it has no caption either. */}
      {configuration.type === 'slot' ? null : (
        <CaptionPreview configuration={configuration} behind={screenBackground} />
      )}
    </>
  )
}
