import { Image as ImageIcon, Trash2 } from 'lucide-react'
import { useMemo } from 'react'

import { EmptyState, PageSection } from '@/app/workspace/PageShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { confirmAction } from '@/components/ui/confirm-store'
import { usePreviewAssetStore } from '@/features/configuration/preview/preview-assets'
import { useDeviceStore } from '@/features/device/device-store'
import { kilobytes } from '@/features/font-library/font-library-store'
import { documentImageIds } from '@shared/document-assets'
import { t } from '@shared/ui-text'
import { Thumbnail } from './image-page-parts'
import { useImageLibraryStore } from './image-library-store'
import { boardStatuses, type BoardImageStatus } from './image-status'

export interface PageMessage {
  kind: 'success' | 'error'
  text: string
}

const STATUS_STYLES: Record<BoardImageStatus, string> = {
  same: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  differs: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  absent: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300'
}

export function LibraryImagesSection({
  busy,
  onMessage
}: {
  busy: boolean
  onMessage: (message: PageMessage) => void
}): React.JSX.Element {
  const snapshot = useImageLibraryStore((state) => state.snapshot)
  const previews = usePreviewAssetStore((state) => state.images)
  const board = useDeviceStore((state) => state.session?.imageAssets)
  const draft = useDeviceStore((state) => state.draft)
  const needed = useMemo(() => documentImageIds(draft), [draft])
  const statuses = useMemo(() => boardStatuses(snapshot, board), [snapshot, board])
  const known = new Set(snapshot.entries.map((entry) => entry.id))
  const missing = needed.filter((id) => !known.has(id))
  const total = snapshot.entries.reduce((sum, entry) => sum + entry.storedBytes, 0)

  const remove = async (id: string): Promise<void> => {
    const question = needed.includes(id)
      ? t('images.library.removeUsed', { id })
      : t('images.library.remove', { id })
    if (!(await confirmAction(question, { danger: true }))) return
    const result = await window.pitrig.removeLibraryImage({ id }).catch(() => undefined)
    if (!result?.ok) {
      onMessage({ kind: 'error', text: result?.error.message ?? t('images.imageLibrary.notRemoved') })
    }
  }

  return (
    <PageSection
      title={t('images.library.title')}
      description={t('images.library.description', { size: kilobytes(total) })}
    >
      {needed.length > 0 ? (
        <p className="mb-2 text-muted-foreground">
          {t('images.library.dashboardDraws', { count: needed.length })}
        </p>
      ) : null}
      {missing.length > 0 ? (
        <p className="mb-2 text-amber-400">
          {t('images.library.notOnThisPc', { images: missing.join(', ') })}
        </p>
      ) : null}
      {snapshot.entries.length === 0 ? (
        <EmptyState
          icon={<ImageIcon aria-hidden="true" className="size-6" />}
          title={t('images.library.empty')}
        >
          {t('images.library.emptyHint')}
        </EmptyState>
      ) : (
        <ul className="grid gap-1 sm:grid-cols-2">
          {snapshot.entries.map((entry) => {
            const status = statuses.get(entry.id)
            return (
              <li key={entry.id} className="flex items-center gap-2.5 rounded-md border p-2">
                <Thumbnail dataUrl={previews[entry.id]?.dataUrl} alt={entry.id} />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block truncate font-mono">{entry.id}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {t('images.imagesPage.widthHeightFormat', {
                      width: entry.width,
                      height: entry.height,
                      format: entry.format
                    })}
                    {entry.frameCount > 1
                      ? t('images.imagesPage.frameCountFrames', { frameCount: entry.frameCount })
                      : ''}
                    {` · ${kilobytes(entry.storedBytes)}`}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {needed.includes(entry.id) ? (
                      <Badge className="border-sky-500/40 bg-sky-500/10 text-sky-300" variant="outline">
                        {t('images.library.inDashboard')}
                      </Badge>
                    ) : null}
                    {status ? (
                      <Badge className={STATUS_STYLES[status]} variant="outline">
                        {t(`images.library.board.${status}`)}
                      </Badge>
                    ) : null}
                  </span>
                </span>
                <Button
                  aria-label={t('fonts.fontsPage.removeName', { name: entry.id })}
                  className="flex-none px-2"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void remove(entry.id)}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {snapshot.unreadable > 0 ? (
        <p className="mt-2 text-amber-400">
          {t('images.library.unreadable', { count: snapshot.unreadable })}
        </p>
      ) : null}
    </PageSection>
  )
}
