import { useMemo } from 'react'
import { t } from '@shared/ui-text'

import { EmptyState, PageSection } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { diffConfigurations } from '@shared/configuration-diff'
import { CONFIGURATION_DOCUMENT_IDS } from '@shared/configuration-schema'
import { documentOf } from '@shared/configuration-documents'

export function ChangesSection(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const board = useDeviceStore((state) => state.activeConfiguration)
  const diffs = useMemo(
    () =>
      board && draft
        ? CONFIGURATION_DOCUMENT_IDS.map((id) => ({
            id,
            diff: diffConfigurations(documentOf(board, id), documentOf(draft, id))
          })).filter((entry) => entry.diff.changes.length > 0 || entry.diff.truncated > 0)
        : [],
    [board, draft]
  )

  return (
    <PageSection
      title={t('configs.changesSection.changesComparedWithTheBoard')}
      description={
        board
          ? t('configs.changesSection.whatASaveWouldWrite')
          : t('configs.changesSection.connectABoardToCompare')
      }
    >
      {!board || !draft ? (
        <EmptyState title={t('configs.changesSection.nothingToCompare')}>
          {t('configs.changesSection.theDraftIsComparedAgainst')}</EmptyState>
      ) : diffs.length === 0 ? (
        <p className="rounded-md border bg-muted/20 p-2 text-muted-foreground">
          {t('configs.changesSection.theDraftMatchesTheBoard')}</p>
      ) : (
        <div className="space-y-3">
          {diffs.map(({ id, diff }) => (
            <div key={id}>
              <p className="mb-1 text-[11px] font-medium text-foreground">
                {t(`documents.label.${id}`)}
              </p>
              <ul className="space-y-0.5 font-mono text-[11px]">
                {diff.changes.map((change) => (
                  <li
                    key={`${change.kind}:${change.path}`}
                    className="flex items-start gap-2 rounded-md px-2 py-1 odd:bg-muted/20"
                  >
                    <span
                      className={
                        change.kind === 'added'
                          ? 'flex-none text-emerald-400'
                          : change.kind === 'removed'
                            ? 'flex-none text-red-400'
                            : 'flex-none text-sky-400'
                      }
                    >
                      {change.kind === 'added' ? '+' : change.kind === 'removed' ? '−' : '~'}
                    </span>
                    <span className="min-w-0 flex-1 break-words text-foreground">
                      {change.path}
                    </span>
                    <span className="flex-none text-muted-foreground">
                      {change.before !== undefined && change.after !== undefined
                        ? t('configs.changesSection.beforeAfter', { before: change.before, after: change.after })
                        : (change.after ?? change.before)}
                    </span>
                  </li>
                ))}
              </ul>
              {diff.truncated > 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t('configs.changesSection.furtherChanges', { count: diff.truncated })}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </PageSection>
  )
}
