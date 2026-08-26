import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { useDeviceStore } from '@/features/device/device-store'
import { useEditorPanelStore } from '@/features/configuration/editor/panel-store'
import { boardLabel, boardName, displaySize } from '@/features/configuration/board-labels'
import { convertDraftToBoard } from '@/features/configuration/configuration-actions'
import { transferReportLines } from '@/features/configuration/transfer-report'
import { SIMCORE_BOARD_IDS, type SimCoreBoardId } from '@shared/device'
import type { LayoutTransferResult } from '@shared/layout-transfer'

export function BoardPicker(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draft = useDeviceStore((state) => state.draft)
  const offlineBoard = useDeviceStore((state) => state.offlineBoard)
  const setOfflineBoard = useDeviceStore((state) => state.setOfflineBoard)
  const fit = useEditorPanelStore((state) => state.transferFit)
  const setFit = useEditorPanelStore((state) => state.setTransferFit)
  const [report, setReport] = useState<LayoutTransferResult>()
  const [error, setError] = useState<string>()

  const board = session?.info.boardId ?? draft?.board ?? offlineBoard ?? ''

  if (session) {
    return (
      <Badge
        className="gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
        variant="outline"
        title="The connected board decides the display while it is plugged in."
      >
        {boardName(session.info.boardId)}
        <span className="text-emerald-400/70">
          {`${session.info.display.width} × ${session.info.display.height}`}
        </span>
      </Badge>
    )
  }

  const choose = (next: SimCoreBoardId | ''): void => {
    setError(undefined)
    setReport(undefined)
    if (!next) {
      setOfflineBoard(undefined)
      return
    }
    if (!draft) {
      setOfflineBoard(next)
      return
    }
    if (draft.board === next) return
    const result = convertDraftToBoard(next, fit)
    if (result.report) setReport(result.report)
    if (result.feedback?.kind === 'error') setError(result.feedback.message)
    if (result.feedback?.kind === 'success') setOfflineBoard(next)
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label="Board"
        className="h-6 max-w-52 rounded-md border bg-transparent px-1 text-xs text-foreground"
        title="Which board this dashboard is authored for"
        value={board}
        onChange={(event) => choose(event.target.value as SimCoreBoardId | '')}
      >
        <option value="">Select a board…</option>
        {SIMCORE_BOARD_IDS.map((id) => (
          <option key={id} value={id}>
            {boardLabel(id)}
          </option>
        ))}
      </select>

      {draft ? (
        <div className="flex items-center rounded-md border" role="group" aria-label="Fit">
          {(['contain', 'stretch'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={fit === option}
              title={
                option === 'contain'
                  ? 'Moving to another board keeps proportions and centres the layout'
                  : 'Moving to another board scales each axis on its own to fill the display'
              }
              className={`h-6 rounded-md px-1.5 text-[11px] transition-colors ${
                fit === option
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setFit(option)}
            >
              {option === 'contain' ? 'Fit' : 'Stretch'}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <span className="max-w-40 truncate text-[11px] text-red-400" title={error}>
          {error}
        </span>
      ) : null}
      {report && transferReportLines(report).length > 0 ? (
        <span
          className="cursor-default text-[11px] text-sky-300"
          title={transferReportLines(report).join('\n')}
        >
          {`${transferReportLines(report).length} notes`}
        </span>
      ) : null}
    </div>
  )
}

export function BoardChoice({
  value,
  onChange
}: {
  value: SimCoreBoardId | ''
  onChange: (board: SimCoreBoardId | '') => void
}): React.JSX.Element {
  return (
    <label className="flex w-64 flex-col gap-1 text-left text-[11px] text-muted-foreground">
      <span>Board</span>
      <select
        className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value as SimCoreBoardId | '')}
      >
        <option value="">Select a board…</option>
        {SIMCORE_BOARD_IDS.map((id) => (
          <option key={id} value={id}>
            {boardLabel(id)}
          </option>
        ))}
      </select>
      {value ? (
        <span>{`The canvas draws at ${displaySize(value)} logical pixels.`}</span>
      ) : (
        <span>Every widget is placed in that display&rsquo;s own pixels.</span>
      )}
    </label>
  )
}
