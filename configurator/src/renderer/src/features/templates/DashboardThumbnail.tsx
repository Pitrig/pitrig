import { useEffect, useMemo } from 'react'

import { screensOf } from '@shared/configuration-access'
import { BOARD_PROFILES, type SimCoreBoardId } from '@shared/device'

import { ScreenGallery } from './ScreenGallery'
import { useTemplatesStore } from './templates-store'

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
