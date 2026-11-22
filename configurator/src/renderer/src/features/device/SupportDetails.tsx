import { ChevronRight } from 'lucide-react'
import { Fragment } from 'react'

import { t } from '@shared/ui-text'
import { Button } from '@/components/ui/button'
import { useUpdateStore } from '@/features/updates/update-store'
import { useCopy } from '@/lib/use-copy'
import { useAppInfo } from './app-info'
import { useDeviceStore } from './device-store'
import { supportRows, supportText } from './support-details'

export function SupportDetails(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const connection = useDeviceStore((state) => state.connection)
  const simhub = useUpdateStore((state) => state.status?.simhub)
  const appInfo = useAppInfo()
  const { copied, copy } = useCopy()
  const rows = supportRows(session, connection, appInfo?.platform)

  const copyDetails = async (event: React.MouseEvent): Promise<void> => {
    event.preventDefault()
    event.stopPropagation()
    await copy(supportText({ appVersion: appInfo?.version, session, simhub, rows }))
  }

  return (
    <details className="group/support rounded-lg border px-2.5 py-[7px] text-xs text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 hover:text-foreground">
          <ChevronRight
            aria-hidden="true"
            className="size-3 transition-transform group-open/support:rotate-90"
          />
          {t('device.supportDetails.detailsForSupport')}
        </span>
        <Button
          variant="outline"
          className="h-7 flex-none px-2.5 text-foreground"
          onClick={(event) => void copyDetails(event)}
        >
          {copied ? t('device.supportDetails.copied') : t('device.supportDetails.copy')}
        </Button>
      </summary>
      <dl className="mt-2 grid grid-cols-[120px_minmax(0,1fr)] gap-x-2.5 gap-y-[3px] text-[11.5px]">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt className="text-muted-foreground/70">{row.label}</dt>
            <dd className="min-w-0 break-words">{row.value}</dd>
          </Fragment>
        ))}
      </dl>
    </details>
  )
}
