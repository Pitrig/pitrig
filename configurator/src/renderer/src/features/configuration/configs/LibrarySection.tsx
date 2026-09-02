import { FileJson, FolderOpen, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { EmptyState, PageSection } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { useConfigurationLibrary } from '../config-library-store'
import {
  openRecentConfiguration,
  openSavedConfiguration,
  type ActionFeedback
} from '../configuration-actions'
import { useDashboardEditorStore } from '../dashboard-editor'
import { BOARD_NAMES } from '../board-labels'
import type { SimCoreBoardId } from '@shared/device'
import { MAXIMUM_CONFIGURATION_NAME, configurationIdFor } from '@shared/config-library'
import { t } from '@shared/ui-text'

export function LibrarySection({
  working,
  onFeedback
}: {
  working: boolean
  onFeedback: (feedback: ActionFeedback) => void
}): React.JSX.Element {
  const { library, error, loading, refresh } = useConfigurationLibrary()
  const draft = useDeviceStore((state) => state.draft)
  const resetEditorState = useDashboardEditorStore((state) => state.resetEditorState)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const disabled = working || busy

  const saveToLibrary = async (): Promise<void> => {
    if (!draft) return
    const trimmed = name.trim()
    const id = configurationIdFor(trimmed)
    if (!id) {
      onFeedback({ kind: 'error', message: t('templates.saveToTemplates.aNameNeedsAtLeast') })
      return
    }
    if (
      library?.saved.some((entry) => entry.id === id) &&
      !window.confirm(t('configs.librarySection.replaceTheSavedConfigurationId', { id: id }))
    ) {
      return
    }
    setBusy(true)
    try {
      const result = await window.simcore.saveConfigurationToLibrary({
        name: trimmed,
        json: JSON.stringify(draft)
      })
      onFeedback(
        result.ok
          ? { kind: 'success', message: t('configs.librarySection.savedAsName', { name: result.value.name }) }
          : { kind: 'error', message: result.error.message }
      )
      if (result.ok) {
        setName('')
        refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string): Promise<void> => {
    if (!window.confirm(t('configs.librarySection.deleteTheSavedConfigurationId', { id: id }))) return
    setBusy(true)
    try {
      const result = await window.simcore.deleteSavedConfiguration({ id })
      if (!result.ok) onFeedback({ kind: 'error', message: result.error.message })
      else refresh()
    } finally {
      setBusy(false)
    }
  }

  const open = async (action: () => Promise<ActionFeedback>): Promise<void> => {
    setBusy(true)
    try {
      const feedback = await action()
      onFeedback(feedback)
      if (feedback.kind === 'success') resetEditorState()
    } finally {
      setBusy(false)
    }
  }

  const forget = async (path: string): Promise<void> => {
    await window.simcore.forgetRecentConfiguration({ path })
    refresh()
  }

  return (
    <>
      <PageSection
        title={t('configs.librarySection.savedConfigurations')}
        description={t('configs.librarySection.keptInTheApplicationS')}
      >
        {error ? <p className="mb-2 text-[11px] text-red-400">{error}</p> : null}
        {loading && !library ? (
          <p className="text-muted-foreground">{t('configs.librarySection.readingTheFolder')}</p>
        ) : library && library.saved.length > 0 ? (
          <ul className="space-y-1">
            {library.saved.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{entry.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {`${BOARD_NAMES[entry.board as SimCoreBoardId] ?? entry.board} · ${entry.screenCount} screen${entry.screenCount === 1 ? '' : 's'} · ${entry.widgetCount} widget${entry.widgetCount === 1 ? '' : 's'} · ${formatWhen(entry.modifiedAt)}`}
                  </span>
                </span>
                <Button
                  className="flex-none"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void open(() => openSavedConfiguration(entry.id))}
                >
                  <FolderOpen aria-hidden="true" className="mr-1.5 size-3.5" />
                  {t('common.open')}</Button>
                <Button
                  aria-label={t('configs.librarySection.deleteName', { name: entry.name })}
                  className="flex-none px-2 text-red-400 hover:text-red-300"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void remove(entry.id)}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<FileJson aria-hidden="true" className="size-6" />}
            title={t('configs.librarySection.nothingSavedYet')}
          >
            {t('configs.librarySection.saveTheCurrentDashboardBelow')}</EmptyState>
        )}
        {library && library.unreadable > 0 ? (
          <p className="mt-2 text-[11px] text-amber-400">
            {`${library.unreadable} file${library.unreadable === 1 ? '' : 's'} in the folder could not be read.`}
          </p>
        ) : null}

        <div className="mt-3 flex items-end gap-2 border-t pt-3">
          <label className="min-w-0 flex-1 space-y-1 text-[11px] text-muted-foreground">
            <span>{t('configs.librarySection.saveTheCurrentDraftAs')}</span>
            <input
              className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
              disabled={disabled || !draft}
              maxLength={MAXIMUM_CONFIGURATION_NAME}
              placeholder={t('configs.librarySection.endurance')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <Button
            className="flex-none"
            variant="outline"
            disabled={disabled || !draft || name.trim().length === 0}
            onClick={() => void saveToLibrary()}
          >
            {t('configs.librarySection.saveToLibrary')}</Button>
        </div>
      </PageSection>

      <PageSection
        title={t('configs.librarySection.recentFiles')}
        description={t('configs.librarySection.filesOpenedOrSavedThrough')}
      >
        {library && library.recent.length > 0 ? (
          <ul className="space-y-1">
            {library.recent.map((entry) => (
              <li
                key={entry.path}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {entry.fileName}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground" title={entry.path}>
                    {entry.missing ? t('configs.librarySection.noLongerAtThisPath') : entry.path}
                  </span>
                </span>
                <Button
                  className="flex-none"
                  variant="outline"
                  disabled={disabled || entry.missing}
                  onClick={() => void open(() => openRecentConfiguration(entry.path))}
                >
                  {t('common.open')}</Button>
                <Button
                  aria-label={t('configs.librarySection.forgetFilename', { fileName: entry.fileName })}
                  className="flex-none px-2"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void forget(entry.path)}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t('configs.librarySection.noRecentFiles')}>
            {t('configs.librarySection.openingOrSavingAJson')}</EmptyState>
        )}
      </PageSection>
    </>
  )
}

function formatWhen(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}
