import { Button } from '@/components/ui/button'
import { UnresolvedFontsDialog } from '@/features/font-library/UnresolvedFontsDialog'
import { useDeviceStore } from './device-store'
import { useDraftState } from './draft-state'
import { saveDraftToBoard, useSaveToBoardStore } from './save-to-board-store'
import { t } from '@shared/ui-text'

export function SaveToBoardButton({
  className,
  disabled
}: {
  className?: string
  disabled?: boolean
}): React.JSX.Element {
  const running = useSaveToBoardStore((state) => state.running)
  const { saveBlockedReason } = useDraftState()
  return (
    <Button
      className={className}
      disabled={disabled || running || saveBlockedReason !== undefined}
      title={saveBlockedReason ?? 'Write the dashboard to the board (fonts install with it)'}
      onClick={() => void saveDraftToBoard()}
    >
      {running ? t('device.saveToBoardUi.saving') : t('device.saveToBoardUi.saveToBoard')}
    </Button>
  )
}

export function SaveProgressBar(): React.JSX.Element | null {
  const progress = useSaveToBoardStore((state) => state.progress)
  if (!progress) return null
  const percent =
    progress.total > 0 ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : 0
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/20 p-2 text-[11px] text-muted-foreground">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{t(`save.stage.${progress.stage}`)}</span>
        {progress.stage === 'uploading' ? (
          <button
            type="button"
            className="text-sky-300/70 hover:text-sky-200"
            onClick={() => void window.simcore.cancelFontUpload()}
          >
            {t('common.cancel')}</button>
        ) : null}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-sky-500 transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="break-words">{progress.message}</p>
    </div>
  )
}

export function SaveFeedbackNote(): React.JSX.Element | null {
  const feedback = useDeviceStore((state) => state.saveFeedback)
  if (!feedback) return null
  return (
    <p
      className={
        feedback.kind === 'error'
          ? 'rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300'
          : 'rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300'
      }
    >
      {feedback.message}
    </p>
  )
}

export function UnresolvedFontsGate(): React.JSX.Element | null {
  const families = useSaveToBoardStore((state) => state.unresolvedFonts)
  const dismiss = useSaveToBoardStore((state) => state.dismissUnresolvedFonts)
  if (!families) return null
  return (
    <UnresolvedFontsDialog
      families={families}
      onRetry={() => {
        dismiss()
        void saveDraftToBoard()
      }}
      onClose={dismiss}
    />
  )
}
