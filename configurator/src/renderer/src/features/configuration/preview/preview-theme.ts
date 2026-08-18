import { type ArcWidgetConfiguration, type BarWidgetConfiguration, type GraphWidgetConfiguration, type ImageWidgetConfiguration, type IndicatorWidgetConfiguration, type ShapeWidgetConfiguration, type TextWidgetConfiguration } from '@shared/configuration-schema'

export type FramedWidgetConfiguration =
  | TextWidgetConfiguration
  | ShapeWidgetConfiguration
  | BarWidgetConfiguration
  | ArcWidgetConfiguration
  | IndicatorWidgetConfiguration
  | GraphWidgetConfiguration
  | ImageWidgetConfiguration

export const SCREEN_BACKGROUND = '#000000'
export const DEFAULT_TEXT_COLOR = '#E8E8E8'
export const DEFAULT_BORDER_COLOR = '#AEAEAE'
