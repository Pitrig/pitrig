import { X } from 'lucide-react'

import { t } from '@shared/ui-text'
import { useOpenReportStore } from './open-report-store'

export function OpenReportNotice(): React.JSX.Element | null {
  const report = useOpenReportStore((state) => state.report)
  const dismiss = useOpenReportStore((state) => state.dismiss)
  if (!report) return null
  return (
    <div
      className={`mx-3 mt-3 flex items-start gap-2 rounded-md border p-2 text-xs ${
        report.kind === 'error'
          ? 'border-red-500/30 bg-red-500/10 text-red-300'
          : 'border-sky-500/30 bg-sky-500/10 text-sky-200'
      }`}
      role="status"
    >
      <p className="min-w-0 flex-1">{report.message}</p>
      <button
        type="button"
        aria-label={t('templates.dashboardSection.dismiss')}
        className="flex-none opacity-70 hover:opacity-100"
        onClick={dismiss}
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  )
}
