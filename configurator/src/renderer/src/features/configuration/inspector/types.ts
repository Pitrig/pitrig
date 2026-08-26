import type {
  ArcWidgetConfiguration,
  BarWidgetConfiguration,
  GraphWidgetConfiguration,
  ImageWidgetConfiguration,
  IndicatorWidgetConfiguration,
  ShapeWidgetConfiguration,
  TextWidgetConfiguration
} from '@shared/configuration-schema'

export type FramedWidget =
  | TextWidgetConfiguration
  | ShapeWidgetConfiguration
  | BarWidgetConfiguration
  | ArcWidgetConfiguration
  | IndicatorWidgetConfiguration
  | GraphWidgetConfiguration
  | ImageWidgetConfiguration
