import type { DashboardTemplateSummary, TemplateVariant } from '@shared/templates'

export function variantSummary(
  summary: DashboardTemplateSummary,
  variant: TemplateVariant
): DashboardTemplateSummary {
  return {
    kind: 'dashboard',
    id: variant.id,
    name: variant.name,
    ...(variant.description ? { description: variant.description } : {}),
    board: summary.board,
    origin: summary.origin,
    screenCount: summary.screenCount,
    widgetCount: summary.widgetCount,
    ...(summary.credit ? { credit: summary.credit } : {})
  }
}

export function summariesOf(summary: DashboardTemplateSummary): DashboardTemplateSummary[] {
  return summary.variants
    ? summary.variants.map((variant) => variantSummary(summary, variant))
    : [summary]
}
