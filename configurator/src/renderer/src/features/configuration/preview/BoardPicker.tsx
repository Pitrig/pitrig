import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { useDeviceStore } from '@/features/device/device-store'
import { useEditorPanelStore } from '@/features/configuration/editor/panel-store'
import { boardLabel, boardName, displaySize } from '@/features/configuration/board-labels'
import { convertDraftToBoard } from '@/features/configuration/configuration-actions'
import { transferReportLines } from '@/features/configuration/transfer-report'
import { SIMCORE_BOARD_IDS, type SimCoreBoardId } from '@shared/device'
import type { LayoutTransferResult } from '@shared/layout-transfer'
import { t } from '@shared/ui-text'

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
        title={t('canvas.boardPicker.theConnectedBoardDecidesThe')}
      >
        {boardName(session.info.boardId)}
        <span className="text-emerald-400/70">
          {session.info.display
            ? t('canvas.menuEntries.widthHeight', { width: session.info.display.width, height: session.info.display.height })
            : t('boards.noDisplay')}
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
        aria-label={t('device.infoPage.board')}
        className="h-6 max-w-52 rounded-md border bg-transparent px-1 text-xs text-foreground"
        title={t('canvas.boardPicker.whichBoardThisDashboardIs')}
        value={board}
        onChange={(event) => choose(event.target.value as SimCoreBoardId | '')}
      >
        <option value="">{t('canvas.boardPicker.selectABoard')}</option>
        {SIMCORE_BOARD_IDS.map((id) => (
          <option key={id} value={id}>
            {boardLabel(id)}
          </option>
        ))}
      </select>

      {draft ? (
        <div className="flex items-center rounded-md border" role="group" aria-label={t('canvas.boardPicker.fit')}>
          {(['contain', 'stretch'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={fit === option}
              title={
                option === 'contain'
                  ? t('canvas.boardPicker.movingToAnotherBoardKeeps')
                  : t('canvas.boardPicker.movingToAnotherBoardScales')
              }
              className={`h-6 rounded-md px-1.5 text-[11px] transition-colors ${
                fit === option
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setFit(option)}
            >
              {option === 'contain' ? t('canvas.boardPicker.fit') : t('canvas.boardPicker.stretch')}
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
          {t('canvas.boardPicker.lengthNotes', { length: transferReportLines(report).length })}
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
      <span>{t('device.infoPage.board')}</span>
      <select
        className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value as SimCoreBoardId | '')}
      >
        <option value="">{t('canvas.boardPicker.selectABoard')}</option>
        {SIMCORE_BOARD_IDS.map((id) => (
          <option key={id} value={id}>
            {boardLabel(id)}
          </option>
        ))}
      </select>
      {value ? (
        <span>{t('canvas.boardPicker.theCanvasDrawsAtValue', { value: displaySize(value) ?? '' })}</span>
      ) : (
        <span>{t('canvas.boardPicker.everyWidgetIsPlacedIn')}</span>
      )}
    </label>
  )
}
