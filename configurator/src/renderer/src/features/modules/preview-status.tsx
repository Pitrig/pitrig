import { Badge } from '@/components/ui/badge'
import { DocumentStatusChip } from '@/features/device/document-status'
import { useDraftState } from '@/features/device/draft-state'
import { useModulesStore } from './modules-store'
import { t } from '@shared/ui-text'

export function ModulesStatusChip(): React.JSX.Element | null {
  const preview = useModulesStore((state) => state.preview)
  const error = useModulesStore((state) => state.previewError)
  const { connected, liveApplyAllowed } = useDraftState()

  if (preview.length === 0) return <DocumentStatusChip document="modules" />
  if (error) {
    return (
      <Badge className="border-red-500/40 bg-red-500/15 text-red-300" variant="outline" title={error}>
        {t('modules.previewStatus.boardRefusedThePreview')}</Badge>
    )
  }
  if (!connected || !liveApplyAllowed) {
    return (
      <Badge className="text-muted-foreground" variant="outline">
        {t('modules.previewStatus.previewingHereOnly')}</Badge>
    )
  }
  return (
    <Badge
      className="border-sky-500/40 bg-sky-500/15 text-sky-300"
      variant="outline"
      title={t('modules.previewStatus.theBoardIsLitBy')}
    >
      {t('modules.previewStatus.previewingOnTheBoard')}</Badge>
  )
}
