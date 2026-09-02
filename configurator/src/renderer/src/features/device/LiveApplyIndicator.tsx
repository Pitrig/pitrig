import { useBoardSyncStore } from './board-sync-store'
import { useDeviceStore } from './device-store'
import { useDraftState } from './draft-state'
import { useLiveApplyStore } from './live-apply-store'
import { t } from '@shared/ui-text'

export function LiveApplyIndicator(): React.JSX.Element | null {
  const connected = useDeviceStore((state) => state.status === 'connected')
  const pending = useLiveApplyStore((state) => state.pending)
  const error = useLiveApplyStore((state) => state.error)
  const question = useBoardSyncStore((state) => state.question)
  const reopen = useBoardSyncStore((state) => state.reopen)
  const { liveApplyBlockedReason, boardShowsDraft } = useDraftState()
  if (!connected) return null

  if (question) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-2 text-xs text-amber-300">
        <span className="truncate">{t('device.liveApplyIndicator.theBoardRunsItsOwn')}</span>
        <button type="button" className="flex-none underline hover:text-amber-200" onClick={reopen}>
          {t('device.liveApplyIndicator.resolve')}</button>
      </span>
    )
  }
  if (error) {
    return (
      <span className="min-w-0 flex-1 truncate text-xs text-amber-300" title={error}>
        {t('device.liveApplyIndicator.livePreviewFailedError', { error: error })}
      </span>
    )
  }
  if (pending) {
    return <span className="flex-none text-xs text-muted-foreground">{t('device.liveApplyIndicator.applyingToTheBoard')}</span>
  }
  if (liveApplyBlockedReason) {
    return (
      <span
        className="min-w-0 flex-1 truncate text-xs text-amber-300"
        title={liveApplyBlockedReason}
      >
        {t('device.liveApplyIndicator.theBoardIsNotFollowing', { liveApplyBlockedReason: liveApplyBlockedReason })}
      </span>
    )
  }
  if (!boardShowsDraft) {
    return <span className="flex-none text-xs text-muted-foreground">{t('device.liveApplyIndicator.sendingToTheBoard')}</span>
  }
  return null
}
