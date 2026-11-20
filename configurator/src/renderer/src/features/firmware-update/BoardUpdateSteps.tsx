import { Check, Circle, LoaderCircle } from 'lucide-react'

import { BOARD_UPDATE_STEPS, type BoardUpdateProgress } from '@shared/firmware-update'
import { t } from '@shared/ui-text'

export function BoardUpdateSteps({
  progress,
  action
}: {
  progress?: BoardUpdateProgress
  action?: React.ReactNode
}): React.JSX.Element {
  const current = progress ? BOARD_UPDATE_STEPS.indexOf(progress.step) : 0
  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
      : undefined

  return (
    <div className="text-[11px] text-muted-foreground">
      <ol className="flex flex-wrap gap-x-3 gap-y-1">
        {BOARD_UPDATE_STEPS.map((step, index) => (
          <li
            key={step}
            className={`flex items-center gap-1 ${index === current ? 'font-medium text-foreground' : ''}`}
          >
            {index < current ? (
              <Check aria-hidden="true" className="size-3 text-emerald-500" />
            ) : index === current ? (
              <LoaderCircle aria-hidden="true" className="size-3 animate-spin" />
            ) : (
              <Circle aria-hidden="true" className="size-3" />
            )}
            {t(`firmware.boardUpdate.step.${step}`)}
          </li>
        ))}
      </ol>
      <div className="mt-2 mb-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-sky-500 transition-[width]"
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <p className="min-w-0 break-words">
          {progress?.message}
          {percent !== undefined ? t('firmware.firmwarePage.percent', { percent }) : ''}
        </p>
        {action}
      </div>
    </div>
  )
}
