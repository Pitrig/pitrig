import {
  AlignLeft,
  Box,
  ChartLine,
  Database,
  Frame,
  Gauge,
  Image,
  Layers,
  LayoutGrid,
  Lightbulb,
  type LucideIcon,
  Monitor,
  MousePointerClick,
  RectangleHorizontal,
  Rows3,
  Ruler,
  Spline,
  Square,
  SquareStack,
  Tag,
  Type,
  Zap
} from 'lucide-react'
import type { WidgetConfiguration } from '@shared/configuration-schema'

// One import site for the icon set, so a change of icon library is one file and
// the panels name what they mean rather than which glyph they picked.

export const WIDGET_ICONS: Record<WidgetConfiguration['type'], LucideIcon> = {
  text: Type,
  shape: Square,
  bar: RectangleHorizontal,
  arc: Gauge,
  indicator: Lightbulb,
  graph: ChartLine,
  image: Image,
  slot: SquareStack
}

export const GROUP_ICONS = {
  action: MousePointerClick,
  arc: Gauge,
  bar: RectangleHorizontal,
  box: Frame,
  conditions: Zap,
  container: Box,
  dashboard: LayoutGrid,
  data: Database,
  geometry: Ruler,
  graph: Spline,
  image: Image,
  pages: Layers,
  screen: Monitor,
  segments: Rows3,
  shape: Square,
  slot: SquareStack,
  strip: Lightbulb,
  title: Tag,
  value: AlignLeft
} satisfies Record<string, LucideIcon>
