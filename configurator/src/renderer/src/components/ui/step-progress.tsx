import { Check, Circle, LoaderCircle } from 'lucide-react'

import { t } from '@shared/ui-text'

export function StepProgress<Step extends string>({
  steps,
  current,
  label,
  completed,
  total,
  message,
  showPercent = true,
  action
}: {
  steps: readonly Step[]
  current: number
  label: (step: Step) => string
  completed?: number
  total?: number
  message?: string
  showPercent?: boolean
  action?: React.ReactNode
}): React.JSX.Element {
  const percent =
    completed !== undefined && total !== undefined && total > 0
      ? Math.min(100, Math.round((completed / total) * 100))
      : undefined

  return (
    <div className="text-[11px] text-muted-foreground">
      <ol className="flex flex-wrap gap-x-3 gap-y-1">
        {steps.map((step, index) => (
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
            {label(step)}
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
          {message}
          {showPercent && percent !== undefined ? t('firmware.firmwarePage.percent', { percent }) : ''}
        </p>
        {action}
      </div>
    </div>
  )
}
