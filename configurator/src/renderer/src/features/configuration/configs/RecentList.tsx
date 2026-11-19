import { Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { confirmAction } from '@/components/ui/confirm-store'
import {
  openRecentConfiguration,
  openSavedConfiguration,
  type ActionFeedback
} from '../configuration-actions'
import { useDashboardEditorStore } from '../dashboard-editor'
import { boardName } from '../board-labels'
import type {
  ConfigurationLibrary,
  RecentConfigurationEntry,
  SavedConfigurationSummary
} from '@shared/config-library'
import { t } from '@shared/ui-text'

type Row =
  | { kind: 'saved'; key: string; when: number; entry: SavedConfigurationSummary }
  | { kind: 'file'; key: string; when: number; entry: RecentConfigurationEntry }

export function RecentList({
  library,
  error,
  loading,
  working,
  onRefresh,
  onFeedback
}: {
  library?: ConfigurationLibrary
  error?: string
  loading: boolean
  working: boolean
  onRefresh: () => void
  onFeedback: (feedback: ActionFeedback) => void
}): React.JSX.Element {
  const resetEditorState = useDashboardEditorStore((state) => state.resetEditorState)
  const [busy, setBusy] = useState(false)
  const disabled = working || busy

  const guarded = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
      onRefresh()
    }
  }

  const open = (action: () => Promise<ActionFeedback>): Promise<void> =>
    guarded(async () => {
      const feedback = await action()
      onFeedback(feedback)
      if (feedback.kind === 'success') resetEditorState()
    })

  const remove = (entry: SavedConfigurationSummary): Promise<void> =>
    guarded(async () => {
      const question = t('configs.recentList.deleteTheSavedCopyName', { name: entry.name })
      if (!(await confirmAction(question, { danger: true }))) return
      const result = await window.pitrig.deleteSavedConfiguration({ id: entry.id })
      if (!result.ok) onFeedback({ kind: 'error', message: result.error.message })
    })

  const forget = (entry: RecentConfigurationEntry): Promise<void> =>
    guarded(async () => {
      await window.pitrig.forgetRecentConfiguration({ path: entry.path })
    })

  const rows = library ? rowsOf(library) : []

  return (
    <div className="mt-4">
      <p className="mb-1 text-[11px] text-muted-foreground">{t('configs.recentList.recent')}</p>
      {error ? <p className="mb-2 text-[11px] text-red-400">{error}</p> : null}
      {loading && !library ? (
        <p className="text-muted-foreground">{t('configs.recentList.reading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">{t('configs.recentList.nothingYet')}</p>
      ) : (
        <ul className="divide-y border-y">
          {rows.map((row) =>
            row.kind === 'saved' ? (
              <RecentRow
                key={row.key}
                name={row.entry.name}
                detail={`${boardName(row.entry.board)} · ${t('configs.recentList.savedInPitrig')} · ${formatWhen(row.when)}`}
                removeLabel={t('configs.recentList.deleteName', { name: row.entry.name })}
                removeIcon={<Trash2 aria-hidden="true" className="size-3.5" />}
                danger
                disabled={disabled}
                onOpen={() => void open(() => openSavedConfiguration(row.entry.id))}
                onRemove={() => void remove(row.entry)}
              />
            ) : (
              <RecentRow
                key={row.key}
                name={row.entry.fileName}
                title={row.entry.path}
                detail={
                  row.entry.missing
                    ? t('configs.recentList.fileMovedOrDeleted')
                    : `${folderOf(row.entry.path)} · ${formatWhen(row.when)}`
                }
                missing={row.entry.missing}
                removeLabel={t('configs.recentList.forgetFilename', { fileName: row.entry.fileName })}
                removeIcon={<X aria-hidden="true" className="size-3.5" />}
                disabled={disabled}
                onOpen={() => void open(() => openRecentConfiguration(row.entry.path))}
                onRemove={() => void forget(row.entry)}
              />
            )
          )}
        </ul>
      )}
      {library && library.unreadable > 0 ? (
        <p className="mt-2 text-[11px] text-amber-400">
          {t('configs.recentList.unreadableCopies', { count: library.unreadable })}
        </p>
      ) : null}
    </div>
  )
}

function RecentRow({
  name,
  title,
  detail,
  missing = false,
  removeLabel,
  removeIcon,
  danger = false,
  disabled,
  onOpen,
  onRemove
}: {
  name: string
  title?: string
  detail: string
  missing?: boolean
  removeLabel: string
  removeIcon: React.ReactNode
  danger?: boolean
  disabled: boolean
  onOpen: () => void
  onRemove: () => void
}): React.JSX.Element {
  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <span className="min-w-0 flex-1 truncate" title={title}>
        <span className="font-medium text-foreground">{name}</span>
        <span className={missing ? 'text-amber-400' : 'text-muted-foreground'}>{` · ${detail}`}</span>
      </span>
      <Button className="flex-none" variant="outline" disabled={disabled || missing} onClick={onOpen}>
        {t('common.open')}</Button>
      <Button
        aria-label={removeLabel}
        title={removeLabel}
        className={`flex-none px-2 ${danger ? 'text-red-400 hover:text-red-300' : ''}`}
        variant="outline"
        disabled={disabled}
        onClick={onRemove}
      >
        {removeIcon}
      </Button>
    </li>
  )
}

function rowsOf(library: ConfigurationLibrary): Row[] {
  const saved: Row[] = library.saved.map((entry) => ({
    kind: 'saved',
    key: `saved:${entry.id}`,
    when: entry.modifiedAt,
    entry
  }))
  const files: Row[] = library.recent.map((entry) => ({
    kind: 'file',
    key: `file:${entry.path}`,
    when: entry.openedAt,
    entry
  }))
  return [...saved, ...files].sort((left, right) => right.when - left.when)
}

function folderOf(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0)
  return (parts.length > 1 ? parts.at(-2) : undefined) ?? path
}

function formatWhen(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}
