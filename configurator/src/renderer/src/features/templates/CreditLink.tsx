import { ExternalLink } from 'lucide-react'

import type { DashboardTemplateSummary } from '@shared/templates'
import { t } from '@shared/ui-text'

export function CreditLink({
  summary
}: {
  summary: DashboardTemplateSummary
}): React.JSX.Element | null {
  const credit = summary.credit
  if (!credit) return null
  return (
    <button
      type="button"
      className="inline-flex w-fit items-center gap-1 text-[11px] text-sky-300 hover:text-sky-200 hover:underline"
      title={credit.url}
      aria-label={t('templates.dashboardSection.creditOpen', { name: credit.name })}
      onClick={() => void window.pitrig.openTemplateCredit({ id: summary.id, kind: 'dashboard' })}
    >
      {t('templates.dashboardSection.creditBy', { name: credit.name })}
      <ExternalLink aria-hidden="true" className="size-3" />
    </button>
  )
}
