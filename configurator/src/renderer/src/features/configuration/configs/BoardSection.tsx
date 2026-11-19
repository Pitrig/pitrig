import { useState } from 'react'
import { t } from '@shared/ui-text'

import { Button } from '@/components/ui/button'
import { useDraftState } from '@/features/device/draft-state'
import { readConfigurationFromBoard, type ActionFeedback } from '../configuration-actions'
import { FeedbackNote } from './FeedbackNote'

export function BoardSection({
  working,
  onAct
}: {
  working: boolean
  onAct: (action: () => Promise<ActionFeedback | undefined>) => Promise<void>
}): React.JSX.Element | null {
  const { connected, dirty, boardMismatch } = useDraftState()
  const [feedback, setFeedback] = useState<ActionFeedback>()

  if (!connected) return null

  const load = async (): Promise<void> => {
    setFeedback(undefined)
    await onAct(async () => {
      setFeedback(await readConfigurationFromBoard())
      return undefined
    })
  }

  return (
    <section className="space-y-2 rounded-xl border bg-card px-4 py-3 text-xs text-card-foreground shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">
          {dirty || boardMismatch
            ? t('configs.boardSection.boardHoldsAnotherSetup')
            : t('configs.boardSection.boardHoldsThisSetup')}
        </span>
        <Button
          className="flex-none"
          variant="outline"
          disabled={working}
          title={t('configs.boardSection.loadFromBoardHint')}
          onClick={() => void load()}
        >
          {t('configs.boardSection.loadFromBoard')}</Button>
      </div>
      <FeedbackNote feedback={feedback} />
    </section>
  )
}
