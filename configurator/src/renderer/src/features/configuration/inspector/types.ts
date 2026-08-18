import type {
  ArcWidgetConfiguration,
  BarWidgetConfiguration,
  GraphWidgetConfiguration,
  ImageWidgetConfiguration,
  IndicatorWidgetConfiguration,
  ShapeWidgetConfiguration,
  TextWidgetConfiguration
} from '@shared/configuration-schema'

// Every widget variant that carries a frame — which is all of them. The shared
// sections (title, box, conditions, colour ramp) edit the frame rather than the
// variant, so they take this rather than one type each.
export type FramedWidget =
  | TextWidgetConfiguration
  | ShapeWidgetConfiguration
  | BarWidgetConfiguration
  | ArcWidgetConfiguration
  | IndicatorWidgetConfiguration
  | GraphWidgetConfiguration
  | ImageWidgetConfiguration
