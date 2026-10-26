import { CircleArrowDown, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useDeviceStore } from '@/features/device/device-store'
import { updateItems } from './update-items'
import { useUpdateStore } from './update-store'
import { t } from '@shared/ui-text'

export function UpdateBanner(): React.JSX.Element | null {
  const status = useUpdateStore((state) => state.status)
  const dismissed = useUpdateStore((state) => state.dismissed)
  const feedback = useUpdateStore((state) => state.feedback)
  const session = useDeviceStore((state) => state.session)
  const items = status
    ? updateItems(status, session).filter((item) => !dismissed.includes(item.key))
    : []
  if (items.length === 0 && !feedback) return null

  return (
    <div
      role="status"
      className="space-y-1.5 border-b border-emerald-500/40 bg-emerald-500/10 px-5 py-2 text-xs text-emerald-100"
    >
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-3">
          <CircleArrowDown aria-hidden="true" className="size-4 flex-none" />
          <p className="min-w-0 flex-1">{item.message}</p>
          <Button className="h-7 flex-none" variant="outline" onClick={item.act}>
            {item.label}
          </Button>
          <button
            type="button"
            aria-label={t('updates.banner.later')}
            title={t('updates.banner.later')}
            className="flex-none rounded p-1 text-emerald-200/80 hover:bg-emerald-500/20"
            onClick={() => useUpdateStore.getState().dismiss(item.key)}
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      ))}
      {feedback ? (
        <div className="flex items-center gap-3">
          <p className={`min-w-0 flex-1 ${feedback.kind === 'error' ? 'text-red-300' : ''}`}>
            {feedback.message}
          </p>
          <button
            type="button"
            aria-label={t('updates.banner.later')}
            className="flex-none rounded p-1 text-emerald-200/80 hover:bg-emerald-500/20"
            onClick={() => useUpdateStore.setState({ feedback: undefined })}
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  )
}
