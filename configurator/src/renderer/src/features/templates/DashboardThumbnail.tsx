import { useEffect, useMemo } from 'react'

import { screensOf } from '@shared/configuration-access'
import { BOARD_PROFILES, type PitrigBoardId } from '@shared/device'

import { PreviewImageOverrides } from '@/features/configuration/preview/preview-assets'
import { ScreenGallery } from './ScreenGallery'
import { useTemplatesStore } from './templates-store'
import { t } from '@shared/ui-text'

export function DashboardThumbnail({
  id,
  board,
  className
}: {
  id: string
  board: PitrigBoardId
  className?: string
}): React.JSX.Element {
  const document = useTemplatesStore((state) => state.documents[id])
  const images = useTemplatesStore((state) => state.images[id])
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
    return <Note className={className}>{t('templates.dashboardThumbnail.noPreview')}</Note>
  }
  if (typeof document !== 'object') {
    return <Note className={className}>{t('templates.dashboardThumbnail.reading')}</Note>
  }
  return (
    <PreviewImageOverrides.Provider value={images}>
      <ScreenGallery screens={screens} display={display} className={className} />
    </PreviewImageOverrides.Provider>
  )
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
