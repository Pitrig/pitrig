import { useEffect, useMemo } from 'react'

import { screensOf } from '@shared/configuration-access'
import { BOARD_PROFILES, type SimCoreBoardId } from '@shared/device'

import { ScreenGallery } from './ScreenGallery'
import { useTemplatesStore } from './templates-store'

/**
 * What a dashboard template looks like.
 *
 * A name and two counts said what a template contained without saying what it
 * *was*; a card that draws the layout answers the question the author is
 * actually asking. The document is read the first time a card needs it and
 * kept, because scrolling a library past the same card twice should cost one
 * read.
 */
export function DashboardThumbnail({
  id,
  board,
  className
}: {
  id: string
  board: SimCoreBoardId
  className?: string
}): React.JSX.Element {
  const document = useTemplatesStore((state) => state.documents[id])
  const loadDocument = useTemplatesStore((state) => state.loadDocument)

  // Asked for again whenever the card is holding nothing — which is not only
  // the first render: a refresh drops the cache, because after a write the same
  // name may stand for a different document. `loadDocument` marks the read in
  // flight, so re-running this cannot start a second one.
  useEffect(() => {
    if (!document) loadDocument(id)
  }, [document, id, loadDocument])

  const screens = useMemo(
    () => (typeof document === 'object' ? screensOf(document) : []),
    [document]
  )
  const display = BOARD_PROFILES[board]?.display

  if (document === 'failed' || !display) {
    return <Note className={className}>No preview</Note>
  }
  if (typeof document !== 'object') {
    return <Note className={className}>Reading…</Note>
  }
  return <ScreenGallery screens={screens} display={display} className={className} />
}

function Note({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={`flex size-full items-center justify-center text-[11px] text-muted-foreground ${className ?? ''}`}
    >
      {children}
    </div>
  )
}
