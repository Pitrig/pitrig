import { BOARD_UPDATE_STEPS, type BoardUpdateProgress } from '@shared/firmware-update'
import { t } from '@shared/ui-text'
import { StepProgress } from '@/components/ui/step-progress'

export function BoardUpdateSteps({
  progress,
  action
}: {
  progress?: BoardUpdateProgress
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <StepProgress
      steps={BOARD_UPDATE_STEPS}
      current={progress ? BOARD_UPDATE_STEPS.indexOf(progress.step) : 0}
      label={(step) => t(`firmware.boardUpdate.step.${step}`)}
      completed={progress?.completed}
      total={progress?.total}
      message={progress?.message}
      action={action}
    />
  )
}
