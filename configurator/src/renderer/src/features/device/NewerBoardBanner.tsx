import { CircleArrowUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useUpdateStore } from '@/features/updates/update-store'

import { documentNames } from '@shared/newer-documents'
import { useDeviceStore } from './device-store'
import { t } from '@shared/ui-text'

export function NewerBoardBanner(): React.JSX.Element | null {
  const documents = useDeviceStore((state) => state.session?.newerDocuments)
  const downloaded = useUpdateStore((state) => state.status?.app.state === 'ready')
  if (!documents?.length) return null

  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-sky-500/40 bg-sky-500/10 px-5 py-2.5 text-xs text-sky-200"
    >
      <CircleArrowUp aria-hidden="true" className="mt-0.5 size-4 flex-none" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sky-100">{t('device.newerBoardBanner.title')}</p>
        <p className="mt-0.5 text-sky-200/90">
          {t('device.newerBoardBanner.explanation', { documents: documentNames(documents) })}
        </p>
      </div>
      <Button
        className="h-7 flex-none"
        variant="outline"
        onClick={() =>
          void (downloaded
            ? window.pitrig.installAppUpdate()
            : window.pitrig.openUpdatePage({ page: 'release' }))
        }
      >
        {downloaded ? t('updates.banner.restartAndUpdate') : t('updates.banner.download')}
      </Button>
    </div>
  )
}
