import type { ActionFeedback } from '../configuration-actions'

/** One action's outcome, in the tone it deserves. */
export function FeedbackNote({
  feedback
}: {
  feedback: ActionFeedback | undefined
}): React.JSX.Element | null {
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
