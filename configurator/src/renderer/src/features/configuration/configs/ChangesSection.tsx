import { useMemo } from 'react'

import { EmptyState, PageSection } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import { diffConfigurations } from '@shared/configuration-diff'
import { CONFIGURATION_DOCUMENT_IDS } from '@shared/configuration-schema'
import { CONFIGURATION_DOCUMENT_LABELS, documentOf } from '@shared/configuration-documents'

export function ChangesSection(): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const activeConfiguration = useDeviceStore((state) => state.activeConfiguration)
  const pendingConfiguration = useDeviceStore((state) => state.pendingConfiguration)
  const board = pendingConfiguration ?? activeConfiguration
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
      title="Changes compared with the board"
      description={
        board
          ? 'What a save would write, per document. Widgets are matched by id, so a move reads as a move.'
          : 'Connect a board to compare the draft against what it is holding.'
      }
    >
      {!board || !draft ? (
        <EmptyState title="Nothing to compare">
          The draft is compared against the configuration the connected board has active or
          pending.
        </EmptyState>
      ) : diffs.length === 0 ? (
        <p className="rounded-md border bg-muted/20 p-2 text-muted-foreground">
          The draft matches the board exactly.
        </p>
      ) : (
        <div className="space-y-3">
          {diffs.map(({ id, diff }) => (
            <div key={id}>
              <p className="mb-1 text-[11px] font-medium text-foreground">
                {CONFIGURATION_DOCUMENT_LABELS[id]}
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
                        ? `${change.before} → ${change.after}`
                        : (change.after ?? change.before)}
                    </span>
                  </li>
                ))}
              </ul>
              {diff.truncated > 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {diff.truncated} further changes not listed.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </PageSection>
  )
}
