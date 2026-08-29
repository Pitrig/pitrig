import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { readConfigurationFromBoard } from '@/features/configuration/configuration-actions'
import { CONFIGURATION_DOCUMENT_LABELS } from '@shared/configuration-documents'
import { useBoardSyncStore } from './board-sync-store'
import { useDeviceStore } from './device-store'
import { useDraftState } from './draft-state'
import { saveDraftToBoard, useSaveToBoardStore } from './save-to-board-store'

const REASON_TEXT: Record<'connected' | 'board_changed', string> = {
  connected: 'The board holds a different configuration than the draft in front of you.',
  board_changed: 'What the board holds changed while you were editing.'
}

export function BoardSyncDialog(): React.JSX.Element | null {
  const question = useBoardSyncStore((state) => state.question)
  const defer = useBoardSyncStore((state) => state.defer)
  const resolve = useBoardSyncStore((state) => state.resolve)
  const boardId = useDeviceStore((state) => state.session?.info.boardId)
  const saving = useSaveToBoardStore((state) => state.running)
  const { liveApplyBlockedReason, saveBlockedReason } = useDraftState()
  const [busy, setBusy] = useState<'board' | 'save'>()
  const [error, setError] = useState<string>()

  if (!question?.open) return null

  const loadFromBoard = async (): Promise<void> => {
    setBusy('board')
    setError(undefined)
    const feedback = await readConfigurationFromBoard()
    setBusy(undefined)
    if (feedback.kind === 'error') {
      setError(feedback.message)
      return
    }
    resolve()
  }

  const saveToBoard = async (): Promise<void> => {
    resolve()
    setBusy('save')
    await saveDraftToBoard()
    setBusy(undefined)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="The board and the draft differ"
        className="w-[30rem] space-y-3 rounded-lg border bg-background p-4 text-xs shadow-lg"
      >
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Board and draft differ</h2>
          <p className="text-muted-foreground">
            {REASON_TEXT[question.reason]} Nothing has been written or applied yet
            {boardId ? ` on ${boardId}` : ''}. Pick which one both sides should follow.
          </p>
        </div>
        <ul className="space-y-1">
          {question.documents.map((document) => (
            <li key={document} className="rounded-md border px-2 py-1.5 text-foreground">
              {CONFIGURATION_DOCUMENT_LABELS[document]} differs
            </li>
          ))}
        </ul>
        {error ? (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-red-300">
            {error}
          </p>
        ) : null}
        <div className="grid gap-2">
          <Button
            disabled={busy !== undefined || saving}
            variant="outline"
            onClick={() => void loadFromBoard()}
          >
            {busy === 'board' ? 'Reading…' : 'Take the board’s configuration'}
          </Button>
          <Button
            disabled={busy !== undefined || saving || liveApplyBlockedReason !== undefined}
            title={liveApplyBlockedReason ?? 'Mirror the draft on the board without writing it'}
            variant="outline"
            onClick={resolve}
          >
            Show the draft on the board
          </Button>
          <Button
            disabled={busy !== undefined || saving || saveBlockedReason !== undefined}
            title={saveBlockedReason ?? 'Write the draft to the board and keep it there'}
            onClick={() => void saveToBoard()}
          >
            Save the draft to the board
          </Button>
        </div>
        <button
          type="button"
          className="w-full text-center text-muted-foreground hover:text-foreground"
          onClick={defer}
        >
          Decide later — the board keeps running what it has
        </button>
      </div>
    </div>
  )
}
